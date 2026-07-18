import { spawn } from 'child_process'
import fs from 'fs'
import type { DownloadOptions, DownloadProgress } from '../../../shared/types'
import { logInfo, logError } from '../logger'
import { getYtdlpPath, getFfmpegPath } from '../toolPaths'
import { killProcessTree } from '../processUtils'
import { buildBaseArgs, ytdlpSpawnEnv } from './config'
import { activeDownloads, cancelledTasks } from './registry'

/**
 * 下载视频，通过 onProgress 回调实时返回进度
 * onDone(err?, filepath?) 仅在最终文件写入磁盘后调用
 */
export function downloadVideo(
  options: DownloadOptions,
  onProgress: (progress: DownloadProgress) => void,
  onDone: (err?: Error, filepath?: string) => void,
): void {
  const maxRetries = 2
  const { url, formatId, outputPath, proxy, taskId, subtitles, audioOnly } = options
  const ytdlpPath = getYtdlpPath()
  const ffmpegPath = getFfmpegPath()

  const args = [...buildBaseArgs(proxy, url)]

  if (subtitles?.enabled && subtitles.languages.length > 0) {
    args.push('--write-subs')
    if (subtitles.includeAuto) args.push('--write-auto-subs')
    args.push('--sub-langs', subtitles.languages.join(','))
    if (subtitles.convertToSrt) args.push('--convert-subs', 'srt')
    if (subtitles.embed) args.push('--embed-subs')
  }

  if (audioOnly) {
    // 仅音频：提取并转 mp3，最高质量
    args.push('-f', 'bestaudio/best')
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
    if (!ffmpegPath) {
      logInfo('[ytdlp] audioOnly requested but ffmpeg not found — extraction may fail')
    }
  } else {
    // 格式选择逻辑：优先单流(mp4)，其次考虑拆分流合并；无 ffmpeg 时强制单流
    let targetFormat = formatId
    if (!targetFormat) {
      if (ffmpegPath) {
        targetFormat = 'best[ext=mp4]/best/bv*+ba/b' // 存在 ffmpeg 保持支持合并，但优先 mp4 单流
      } else {
        targetFormat = 'best[ext=mp4]/b' // 不存在 ffmpeg，降级纯单流
        logInfo('[ytdlp] ffmpeg not found — forcing single stream format')
      }
    }
    args.push('-f', targetFormat)
  }

  if (options.section) {
    const toHms = (s: number) => {
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      const sec = Math.floor(s % 60)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }
    args.push('--download-sections', `*${toHms(options.section.start)}-${toHms(options.section.end)}`)
    args.push('--force-keyframes-at-cuts')
  }

  args.push('-o', outputPath)
  args.push('--windows-filenames')
  // 优化下载参数：禁用 part、开启 5 并发分片（默认不限速）
  args.push('--continue', '--no-overwrites', '--no-part')
  args.push('--concurrent-fragments', '5')

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath)
    if (!audioOnly) args.push('--merge-output-format', 'mp4')
  }

  args.push(
    '--newline',
    '--progress',
    '--progress-template', 'download:[VD_PROGRESS]%(progress._percent_str)s|%(progress._total_bytes_str)s|%(progress._total_bytes_estimate_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print', 'after_move:[VD_FILEPATH]%(filepath)s',
    '--print', 'after_video:[VD_FILEPATH]%(filepath)s',
  )
  args.push(url)

  const attemptDownload = (attempt: number) => {
    if (cancelledTasks.has(taskId)) {
      cancelledTasks.delete(taskId)
      onDone(new Error('[CANCELLED]'))
      return
    }

    logInfo(`[downloadVideo] start attempt ${attempt + 1}/${maxRetries + 1} for task ${taskId}`)
    const proc = spawn(ytdlpPath, args, { env: ytdlpSpawnEnv() })
    activeDownloads.set(taskId, proc)

    const progressRe = /^\[VD_PROGRESS\]\s*(\d+\.?\d*)%?\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.+)/
    let finalFilepath: string | undefined
    let fallbackFilepath: string | undefined
    let stderrBuf = ''
    let stdoutRemainder = ''
    let killedByTimeout = false
    // 防止 close 事件与 setInterval 竞态：close 触发后不允许 interval 再设置 killedByTimeout
    let processClosed = false
    // 防止 error + close 双触发：Node.js spawn 失败时两个事件都会触发
    let settled = false

    // 超时检测逻辑
    let lastActiveTime = Date.now()
    const timeout = setInterval(() => {
      // 进程已关闭则清理 interval，避免 killedByTimeout 被误设为 true
      if (processClosed) { clearInterval(timeout); return }
      if (Date.now() - lastActiveTime > 60_000) {
        clearInterval(timeout)
        killedByTimeout = true
        killProcessTree(proc) // 中止僵死进程
        logError(`[downloadVideo] process forcefully killed due to timeout for task ${taskId}`)
      }
    }, 10_000)

    const parseLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) return

      if (trimmed.startsWith('[VD_FILEPATH]')) {
        const fp = trimmed.slice('[VD_FILEPATH]'.length).trim()
        if (fp && fp !== 'NA') finalFilepath = fp
        return
      }
      const alreadyMatch = /^\[download\]\s+(.*?)\s+has already been downloaded/i.exec(trimmed)
      if (alreadyMatch) { fallbackFilepath = alreadyMatch[1].trim(); return }
      const mergedMatch = /^\[Merger\]\s+Merging formats into\s+"([^"]+)"/i.exec(trimmed)
      if (mergedMatch) { fallbackFilepath = mergedMatch[1].trim(); return }
      const destMatch = /^\[download\]\s+Destination:\s+(.*)/i.exec(trimmed)
      if (destMatch && !fallbackFilepath) { fallbackFilepath = destMatch[1].trim(); return }
      const fixupMatch = /^\[Fixup([^\]]*?)\]\s+Fixing video.*?in\s+"([^"]+)"/i.exec(trimmed)
      if (fixupMatch) { fallbackFilepath = fixupMatch[2].trim(); return }

      const match = progressRe.exec(trimmed)
      if (match) {
        let filesize = match[2].trim()
        if (!filesize || filesize === 'NA') {
          const est = match[3].trim()
          if (est && est !== 'NA') filesize = '~' + est
        }
        if (!filesize || filesize === 'NA') filesize = '未知大小'

        onProgress({
          taskId,
          progress: parseFloat(match[1]),
          filesize,
          speed: match[4].trim(),
          eta: match[5].trim(),
        })
      }
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      lastActiveTime = Date.now()
      const text = chunk.toString()
      const lines = (stdoutRemainder + text).split('\n')
      stdoutRemainder = lines.pop() || ''
      lines.forEach(parseLine)
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      lastActiveTime = Date.now()
      stderrBuf += chunk.toString()
      if (stderrBuf.length > 50_000) stderrBuf = stderrBuf.slice(-50_000)
    })

    proc.on('close', (code) => {
      if (settled) return   // error 事件已先触发并处理，避免重复执行 retry/onDone
      processClosed = true  // 必须在 clearInterval 之前设置，封堵竞态窗口
      settled = true
      clearInterval(timeout)
      activeDownloads.delete(taskId)

      if (stdoutRemainder.trim()) parseLine(stdoutRemainder)

      // 检查主动取消
      if (cancelledTasks.has(taskId)) {
        cancelledTasks.delete(taskId)
        onDone(new Error('[CANCELLED]'))
        return
      }

      // 超时强杀：直接报错，不再重试（避免无限重试僵死链接）
      if (killedByTimeout) {
        onDone(new Error('下载长时间无响应，已超时'))
        return
      }

      let downloadErr: Error | undefined

      if (code !== 0) {
        const errMsg = stderrBuf.trim().slice(-500) || `yt-dlp 退出码 ${code}`
        downloadErr = new Error(errMsg)
      } else {
        // exit code 0：信任 yt-dlp 已成功写盘。
        // 若路径捕获失败（老版 yt-dlp 不支持 after_move hook）仅记录警告，不作为失败处理。
        const checkFile = finalFilepath || fallbackFilepath
        if (checkFile && !fs.existsSync(checkFile)) {
          logInfo(`[downloadVideo] reported path not found locally (may be network drive or path encoding issue): ${checkFile}`)
        }
      }

      if (downloadErr) {
        logError(`[downloadVideo] attempt ${attempt + 1} failed:`, downloadErr)
        if (attempt < maxRetries) {
          logInfo(`[downloadVideo] starting retry attempt ${attempt + 2}...`)
          setTimeout(() => attemptDownload(attempt + 1), 2000)
        } else {
          onDone(downloadErr)
        }
      } else {
        const checkFile = finalFilepath || fallbackFilepath
        logInfo(`[downloadVideo] success for task ${taskId}, file: ${checkFile}`)
        onDone(undefined, checkFile)
      }
    })

    proc.on('error', (err) => {
      settled = true        // 阻止后续 close 事件再执行 retry/onDone
      processClosed = true  // 阻止 interval 继续运行
      clearInterval(timeout)
      activeDownloads.delete(taskId)
      logError(`[downloadVideo] process error:`, err)
      onDone(new Error('启动 yt-dlp 失败：' + err.message))
    })
  }

  attemptDownload(0)
}
