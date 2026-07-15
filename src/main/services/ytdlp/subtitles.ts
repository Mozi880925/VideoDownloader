import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logInfo, logError } from '../logger'
import { getYtdlpPath } from '../toolPaths'
import { buildBaseArgs } from './config'

// ────────── 字幕提取（仅下载字幕，不下载视频） ──────────

export interface ExtractSubtitlesResult {
  status: 'success' | 'failed'
  title?: string
  duration?: number
  srtPaths?: string[]
  errorMessage?: string
}

export function extractSubtitles(
  url: string,
  outputDir: string,
  langs: string = 'zh.*,en.*,ja,ko',
): Promise<ExtractSubtitlesResult> {
  return new Promise((resolve) => {
    if (!fs.existsSync(outputDir)) {
      try { fs.mkdirSync(outputDir, { recursive: true }) } catch {}
    }

    const outTemplate = path.join(outputDir, '%(title).100s.%(ext)s')
    const args = [
      ...buildBaseArgs(),
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', langs,
      '--convert-subs', 'srt',
      '--print', 'title',
      '--print', 'duration',
      '--print', 'after_move:filepath',
      '-o', outTemplate,
      url,
    ]

    const proc = spawn(getYtdlpPath(), args, { windowsHide: true })

    let stdoutBuf = ''
    let stderrBuf = ''
    const printedLines: string[] = []
    let title: string | undefined
    let duration: number | undefined
    const srtPaths: string[] = []

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        printedLines.push(line)
        // 第一个 print 是 title，第二个是 duration，之后才是 filepath
        if (title === undefined) { title = line; continue }
        if (duration === undefined) {
          const n = parseFloat(line)
          duration = isNaN(n) ? 0 : Math.round(n)
          continue
        }
        // 后续都是 filepath
        if (line.toLowerCase().endsWith('.srt') && fs.existsSync(line)) {
          srtPaths.push(line)
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      if (stderrBuf.length > 50_000) stderrBuf = stderrBuf.slice(-50_000)
    })

    proc.on('close', (code) => {
      if (code === 0 && srtPaths.length > 0) {
        logInfo(`[ytdlp] subtitles extracted: ${srtPaths.length} files for ${url}`)
        resolve({ status: 'success', title, duration, srtPaths })
      } else if (code === 0) {
        // 进程成功但没有字幕文件 → 视频没有字幕
        resolve({ status: 'failed', title, errorMessage: '该视频没有可提取的字幕' })
      } else {
        const errMsg = stderrBuf.split('\n').filter(l => l.includes('ERROR') || l.includes('error')).slice(-3).join('\n').trim()
                      || stderrBuf.slice(-500)
                      || '字幕提取失败'
        logError(`[ytdlp] extract subtitles failed (code=${code}): ${errMsg}`)
        resolve({ status: 'failed', errorMessage: errMsg })
      }
    })

    proc.on('error', (err) => {
      resolve({ status: 'failed', errorMessage: '启动 yt-dlp 失败：' + err.message })
    })
  })
}
