import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'
import type { FrameExtractOptions, FrameExtractResult } from '../../shared/types'
import { getFfmpegPath, getFfprobePath } from './toolPaths'
import { logInfo, logError } from './logger'

const execFileAsync = promisify(execFile)

/**
 * 解析时间戳字符串为秒数
 * 支持格式：
 *   "90"      → 90 秒
 *   "1:30"    → 90 秒
 *   "1:05:30" → 3930 秒
 *   "00:30.500" → 30.5 秒
 */
function parseTimestamp(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  // 纯数字
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  // MM:SS 或 HH:MM:SS
  const parts = s.split(':').map((p) => p.trim())
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
  }
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
  }
  return null
}

/**
 * 用 ffprobe 获取视频时长（秒）
 */
async function probeDuration(videoPath: string): Promise<number> {
  const ffprobe = getFfprobePath()
  if (!ffprobe) throw new Error('未找到 ffprobe，请确认已安装 ffmpeg（通常 ffprobe 随 ffmpeg 一起分发）')
  const { stdout } = await execFileAsync(
    ffprobe,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { timeout: 15_000 },
  )
  const sec = parseFloat(stdout.trim())
  if (!isFinite(sec) || sec <= 0) throw new Error(`ffprobe 返回的时长无效：${stdout.trim() || '空'}`)
  return sec
}

/**
 * 单次 ffmpeg spawn，返回 exit code 和 stderr
 */
function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  const ffmpeg = getFfmpegPath()
  if (!ffmpeg) return Promise.reject(new Error('未找到 ffmpeg，请先安装并确保其在 PATH 中'))
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpeg, args)
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { proc.kill() } catch {}
      reject(new Error('ffmpeg 执行超时'))
    }, timeoutMs)

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().slice(-500) || `ffmpeg 退出码 ${code}`))
    })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('启动 ffmpeg 失败：' + err.message))
    })
  })
}

function formatTimeForFilename(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}_${pad(m)}_${pad(s)}`
}

function ensureOutputDir(videoPath: string, requested?: string): string {
  if (requested) {
    fs.mkdirSync(requested, { recursive: true })
    return requested
  }
  const dir = path.dirname(videoPath)
  const base = path.basename(videoPath, path.extname(videoPath))
  const out = path.join(dir, `${base}_frames`)
  fs.mkdirSync(out, { recursive: true })
  return out
}

function countJpegs(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).length
  } catch {
    return 0
  }
}

/**
 * 提取关键帧
 */
export async function extractFrames(options: FrameExtractOptions): Promise<FrameExtractResult> {
  const { videoPath, mode } = options
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('视频文件不存在：' + videoPath)
  }
  if (!getFfmpegPath()) {
    throw new Error('未找到 ffmpeg，请先安装并确保其在系统 PATH 中')
  }

  const outputDir = ensureOutputDir(videoPath, options.outputDir)
  const quality = options.quality ?? 3   // ffmpeg -q:v，2=视觉无损，3=高质量
  const beforeCount = countJpegs(outputDir)

  logInfo(`[ffmpeg] extract frames mode=${mode} video=${videoPath} out=${outputDir}`)

  if (mode === 'uniform') {
    const count = Math.max(1, Math.min(100, options.count ?? 10))
    const duration = await probeDuration(videoPath)
    // 取中点均匀分布，避开首尾黑屏
    const step = duration / (count + 1)
    const tasks: Promise<void>[] = []
    for (let i = 1; i <= count; i++) {
      const t = i * step
      const outFile = path.join(outputDir, `frame_${String(i).padStart(3, '0')}_${formatTimeForFilename(t)}.jpg`)
      const args = [
        '-y',
        '-ss', String(t),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', String(quality),
        outFile,
      ]
      tasks.push(runFfmpeg(args, 30_000))
    }
    await Promise.all(tasks)
  } else if (mode === 'scene') {
    const threshold = Math.max(0.01, Math.min(0.99, options.sceneThreshold ?? 0.3))
    const args = [
      '-y',
      '-i', videoPath,
      '-vf', `select='gt(scene,${threshold})',showinfo`,
      '-vsync', 'vfr',
      '-q:v', String(quality),
      path.join(outputDir, 'frame_%04d.jpg'),
    ]
    // 场景模式需要扫全片，给更长超时
    const timeoutMs = Math.max(60_000, Math.ceil((await probeDuration(videoPath).catch(() => 600)) * 1000))
    await runFfmpeg(args, timeoutMs)
  } else if (mode === 'timestamps') {
    const tsList = (options.timestamps ?? [])
      .map((raw) => parseTimestamp(raw))
      .filter((t): t is number => t !== null && t >= 0)
    if (tsList.length === 0) throw new Error('没有有效的时间戳（示例格式：00:30、1:15:30、90）')
    const tasks: Promise<void>[] = []
    tsList.forEach((t, i) => {
      const outFile = path.join(outputDir, `frame_${String(i + 1).padStart(3, '0')}_${formatTimeForFilename(t)}.jpg`)
      const args = [
        '-y',
        '-ss', String(t),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', String(quality),
        outFile,
      ]
      tasks.push(runFfmpeg(args, 30_000))
    })
    await Promise.all(tasks)
  } else {
    throw new Error('未知的提取模式：' + mode)
  }

  const afterCount = countJpegs(outputDir)
  const frameCount = afterCount - beforeCount
  logInfo(`[ffmpeg] extract frames done: ${frameCount} files in ${outputDir}`)

  if (frameCount === 0) {
    throw new Error('未生成任何帧，可能是 ffmpeg 拒绝了输入或场景阈值过高')
  }

  return { outputDir, frameCount }
}

/**
 * 对外检测：ffmpeg + ffprobe 是否都就绪
 */
export function ffmpegReady(): { ffmpeg: boolean; ffprobe: boolean } {
  return {
    ffmpeg: !!getFfmpegPath(),
    ffprobe: !!getFfprobePath(),
  }
}
