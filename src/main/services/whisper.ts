import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type { TranscribeOptions, TranscribeResult, TranscribeProgress } from '../../shared/types'
import { getFfmpegPath } from './toolPaths'
import { killProcessTree } from './processUtils'
import { logInfo, logError } from './logger'

// ────────── Active process registry ──────────
const activeTranscribes = new Map<string, ReturnType<typeof spawn>>()
const cancelledTranscribes = new Set<string>()

export function killAllTranscribes() {
  for (const [id, p] of activeTranscribes) {
    logInfo('[whisper] killing active transcribe on quit: ' + id)
    killProcessTree(p)
  }
  activeTranscribes.clear()
}

export function cancelTranscribe(taskId: string): boolean {
  cancelledTranscribes.add(taskId)
  const proc = activeTranscribes.get(taskId)
  if (!proc) return false
  killProcessTree(proc)
  activeTranscribes.delete(taskId)
  return true
}

// ────────── Helpers ──────────

function validateConfig(cfg: TranscribeOptions['config']): string | null {
  if (!cfg.executablePath || !fs.existsSync(cfg.executablePath)) {
    return 'Whisper 可执行文件路径未配置或不存在，请到「设置 → 字幕设置」里选择'
  }
  if (!cfg.modelPath || !fs.existsSync(cfg.modelPath)) {
    return 'Whisper 模型文件路径未配置或不存在，请到「设置 → 字幕设置」里选择 ggml-*.bin 模型'
  }
  return null
}

/**
 * 用 ffmpeg 提 16kHz 单声道 WAV 到临时目录
 */
function extractAudioAsWav(videoPath: string, taskId: string): Promise<string> {
  const ffmpeg = getFfmpegPath()
  if (!ffmpeg) return Promise.reject(new Error('未找到 ffmpeg，无法提取音频'))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vdl-whisper-'))
  const wavPath = path.join(tmpDir, `${taskId}.wav`)
  const args = [
    '-y', '-i', videoPath,
    '-ac', '1',          // 单声道
    '-ar', '16000',      // 16kHz
    '-vn',               // 去掉视频流
    '-f', 'wav',
    wavPath,
  ]

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpeg, args)
    activeTranscribes.set(`${taskId}:audio`, proc)
    let stderr = ''
    let settled = false

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 10_000) stderr = stderr.slice(-10_000)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      activeTranscribes.delete(`${taskId}:audio`)
      if (cancelledTranscribes.has(taskId)) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
        reject(new Error('[CANCELLED]'))
        return
      }
      if (code === 0 && fs.existsSync(wavPath)) {
        resolve(wavPath)
      } else {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
        reject(new Error(stderr.trim().slice(-400) || `ffmpeg 退出码 ${code}`))
      }
    })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      activeTranscribes.delete(`${taskId}:audio`)
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
      reject(new Error('启动 ffmpeg 失败：' + err.message))
    })
  })
}

/**
 * 解析 whisper 输出的时间戳行 "[00:00:00.000 --> 00:00:04.400] ..."
 * 返回结束时间（秒）
 */
function parseWhisperTimestamp(line: string): number | null {
  const m = /-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(line)
  if (!m) return null
  const h = parseInt(m[1], 10), mm = parseInt(m[2], 10), s = parseInt(m[3], 10), ms = parseInt(m[4], 10)
  return h * 3600 + mm * 60 + s + ms / 1000
}

/**
 * 转写 videoPath → srt 文件
 */
export function transcribeVideo(
  options: TranscribeOptions,
  onProgress: (p: TranscribeProgress) => void,
): Promise<TranscribeResult> {
  const { videoPath, config, taskId, outputDir, overwrite } = options

  const cfgErr = validateConfig(config)
  if (cfgErr) return Promise.reject(new Error(cfgErr))
  if (!fs.existsSync(videoPath)) return Promise.reject(new Error('视频文件不存在：' + videoPath))

  const dir = outputDir || path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))
  const srtPath = path.join(dir, `${base}.srt`)
  if (fs.existsSync(srtPath) && !overwrite) {
    return Promise.reject(new Error(`同名字幕已存在：${srtPath}（勾选覆盖后重试）`))
  }

  return (async () => {
    onProgress({ taskId, progress: 2, stage: 'extracting-audio' })
    const wavPath = await extractAudioAsWav(videoPath, taskId)

    // 总时长估计：用 ffprobe 会更准，但简化起见这里只在转写阶段根据时间戳推进
    let totalDurationHint = 0
    try {
      const statWav = fs.statSync(wavPath)
      // 16kHz mono 16bit = 32000 byte/s，粗略估计
      totalDurationHint = Math.max(1, statWav.size / 32000)
    } catch { /* ignore */ }

    onProgress({ taskId, progress: 6, stage: 'transcribing' })

    const outPrefix = path.join(dir, base)
    const args = [
      '-m', config.modelPath,
      '-l', config.language || 'auto',
      '-osrt',                  // 输出 srt
      '-of', outPrefix,         // 输出前缀（会自动加 .srt）
      '-t', String(Math.max(1, Math.min(32, config.threads || 4))),
      wavPath,
    ]

    logInfo(`[whisper] spawn ${config.executablePath} ${args.join(' ')}`)

    return new Promise<TranscribeResult>((resolve, reject) => {
      const proc = spawn(config.executablePath, args)
      activeTranscribes.set(taskId, proc)
      let stderr = ''
      let settled = false
      let lastProgress = 6

      const cleanup = () => {
        activeTranscribes.delete(taskId)
        try { fs.rmSync(path.dirname(wavPath), { recursive: true, force: true }) } catch {}
      }

      const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        const endSec = parseWhisperTimestamp(trimmed)
        if (endSec != null && totalDurationHint > 0) {
          const pct = Math.min(99, Math.max(lastProgress, Math.round((endSec / totalDurationHint) * 100)))
          if (pct > lastProgress) {
            lastProgress = pct
            onProgress({ taskId, progress: pct, stage: 'transcribing', lastLine: trimmed })
          } else {
            onProgress({ taskId, progress: lastProgress, stage: 'transcribing', lastLine: trimmed })
          }
        } else {
          onProgress({ taskId, progress: lastProgress, stage: 'transcribing', lastLine: trimmed })
        }
      }

      let stdoutBuf = ''
      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString()
        const lines = (stdoutBuf + text).split('\n')
        stdoutBuf = lines.pop() || ''
        lines.forEach(handleLine)
      })
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        stderr += text
        if (stderr.length > 20_000) stderr = stderr.slice(-20_000)
        // whisper.cpp 部分版本把每段输出到 stderr
        text.split('\n').forEach(handleLine)
      })

      proc.on('close', (code) => {
        if (settled) return
        settled = true
        cleanup()
        if (cancelledTranscribes.has(taskId)) {
          cancelledTranscribes.delete(taskId)
          reject(new Error('[CANCELLED]'))
          return
        }
        if (code !== 0) {
          reject(new Error(stderr.trim().slice(-500) || `whisper 退出码 ${code}`))
          return
        }
        if (!fs.existsSync(srtPath)) {
          reject(new Error(`转写完成但未找到 srt 文件：${srtPath}`))
          return
        }
        onProgress({ taskId, progress: 100, stage: 'done' })
        resolve({ srtPath })
      })

      proc.on('error', (err) => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('启动 whisper 失败：' + err.message))
      })
    })
  })()
}

/**
 * 检测 whisper 配置就绪状态
 */
export function whisperReady(cfg: TranscribeOptions['config'] | undefined | null): { ready: boolean; reason?: string } {
  if (!cfg) return { ready: false, reason: '未配置 Whisper' }
  const err = validateConfig(cfg)
  if (err) return { ready: false, reason: err }
  if (!getFfmpegPath()) return { ready: false, reason: '缺少 ffmpeg（需要用它提取音频）' }
  return { ready: true }
}
