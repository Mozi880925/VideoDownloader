import { spawn, exec, execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import type {
  VideoInfo,
  VideoFormat,
  VideoChapter,
  DownloadOptions,
  DownloadProgress,
  YtdlpInfo,
  SearchResult,
  VideoListItem,
  VideoListResult,
} from '../../shared/types'
import { logInfo, logError } from './logger'

const execFileAsync = promisify(execFile)

// ────────── Path cache ──────────

let cachedYtdlpPath: string | null = null
let cachedJsRuntime: { kind: 'node' | 'deno'; path: string } | null | undefined = undefined  // undefined = not yet resolved
let cachedFfmpegPath: string | null | undefined = undefined  // undefined = not yet resolved
let cachedFfprobePath: string | null | undefined = undefined  // undefined = not yet resolved

/**
 * Async resolve: find executable via `where` (Windows)
 */
async function whichAsync(name: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('where', [name], { timeout: 5000, encoding: 'utf8' })
    const found = stdout.trim().split('\n')[0].trim()
    if (found && fs.existsSync(found)) return found
  } catch {}
  return null
}

async function resolveYtdlpPathAsync(): Promise<string> {
  const found = await whichAsync('yt-dlp')
  return found || 'yt-dlp'
}

async function resolveJsRuntimeAsync(): Promise<{ kind: 'node' | 'deno'; path: string } | null> {
  // 优先检测 Deno
  const deno = await whichAsync('deno')
  if (deno) return { kind: 'deno', path: deno }
  // 动态检测 Node（不硬编码路径，通过 where/which 解析）
  const node = await whichAsync('node')
  if (node) return { kind: 'node', path: node }
  return null
}

async function resolveFfmpegPathAsync(): Promise<string | null> {
  return whichAsync('ffmpeg')
}

async function resolveFfprobePathAsync(ffmpegPath: string | null): Promise<string | null> {
  const direct = await whichAsync('ffprobe')
  if (direct) return direct
  // Fallback: ffprobe 通常与 ffmpeg 同目录
  if (ffmpegPath) {
    const guess = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')
    if (guess !== ffmpegPath && fs.existsSync(guess)) return guess
  }
  return null
}

/**
 * 初始化所有路径缓存（启动时调用一次，异步非阻塞）
 */
export async function initPaths(): Promise<void> {
  const [ytdlp, jsrt, ffmpeg] = await Promise.all([
    resolveYtdlpPathAsync(),
    resolveJsRuntimeAsync(),
    resolveFfmpegPathAsync(),
  ])
  cachedYtdlpPath = ytdlp
  cachedJsRuntime = jsrt
  cachedFfmpegPath = ffmpeg
  cachedFfprobePath = await resolveFfprobePathAsync(ffmpeg)

  console.log('[ytdlp] resolved yt-dlp  :', cachedYtdlpPath, '| exists:', fs.existsSync(cachedYtdlpPath))
  console.log('[ytdlp] resolved ffmpeg  :', cachedFfmpegPath ?? 'not found', '| exists:', cachedFfmpegPath ? fs.existsSync(cachedFfmpegPath) : false)
  console.log('[ytdlp] resolved ffprobe :', cachedFfprobePath ?? 'not found', '| exists:', cachedFfprobePath ? fs.existsSync(cachedFfprobePath) : false)
  console.log('[ytdlp] resolved js-rt   :', cachedJsRuntime ? `${cachedJsRuntime.kind}:${cachedJsRuntime.path}` : 'none')
  console.log('[ytdlp] cookies source   : --cookies <file> (path synced from renderer settings)')
}

// ────────── Cached getters (sync, zero-cost) ──────────

function getYtdlpPath(): string {
  return cachedYtdlpPath || 'yt-dlp'
}

function getJsRuntime(): { kind: 'node' | 'deno'; path: string } | null {
  return cachedJsRuntime ?? null
}

function getFfmpegPath(): string | null {
  return cachedFfmpegPath ?? null
}

export function getFfmpegPathPublic(): string | null {
  return cachedFfmpegPath ?? null
}

export function getFfprobePathPublic(): string | null {
  return cachedFfprobePath ?? null
}

export function getYtdlpPathPublic(): string {
  return cachedYtdlpPath || 'yt-dlp'
}

// ────────── Cookies file path (set by renderer via IPC on startup / settings change) ──────────

let cachedCookiesPath = ''

export function setCookiesPath(filePath: string): void {
  cachedCookiesPath = filePath
  logInfo(`[ytdlp] cookies path updated: ${filePath || '(none)'}`)
}

// ────────── Douyin browser cookies (抖音需要新鲜 Cookie，直接读浏览器) ──────────

let cachedDouyinBrowser = 'chrome'  // 默认 Chrome

export function setDouyinCookiesBrowser(browser: string): void {
  cachedDouyinBrowser = browser
  logInfo(`[ytdlp] douyin cookies browser: ${browser || '(none)'}`)
}

/** 判断 URL 是否属于抖音平台 */
function isDouyinUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'douyin.com' ||
           hostname.endsWith('.douyin.com') ||
           hostname === 'iesdouyin.com' ||
           hostname.endsWith('.iesdouyin.com')
  } catch {
    return false
  }
}

// ────────── Proxy URL (set by renderer via IPC on startup / settings change) ──────────

let cachedProxyUrl = ''

export function setProxyUrl(url: string): void {
  cachedProxyUrl = url
  logInfo(`[ytdlp] proxy url updated: ${url || '(none)'}`)
}

// ────────── Shared base args ──────────

function buildBaseArgs(proxy?: string, targetUrl?: string): string[] {
  const args: string[] = ['--no-warnings']

  // 显式传入的 proxy 优先；否则用全局缓存值
  const effectiveProxy = proxy || cachedProxyUrl
  if (effectiveProxy) args.push('--proxy', effectiveProxy)

  const js = getJsRuntime()
  if (js) args.push('--js-runtimes', `${js.kind}:${js.path}`)
  else console.warn('[ytdlp] No JS runtime found — YouTube n-challenge may fail')

  // 抖音需要新鲜浏览器 Cookie；其他平台使用 cookies 文件
  if (targetUrl && isDouyinUrl(targetUrl)) {
    if (cachedDouyinBrowser && cachedDouyinBrowser !== 'none') {
      args.push('--cookies-from-browser', cachedDouyinBrowser)
    }
  } else if (cachedCookiesPath && fs.existsSync(cachedCookiesPath)) {
    args.push('--cookies', cachedCookiesPath)
  }

  return args
}

// ────────── Process management ──────────

const activeDownloads = new Map<string, ReturnType<typeof spawn>>()
const activeParses = new Map<string, ReturnType<typeof spawn>>()
const cancelledTasks = new Set<string>()

/**
 * 杀死进程树（Windows 使用 taskkill /T /F，其他平台使用 negative PID）
 */
function killProcessTree(proc: ReturnType<typeof spawn>): void {
  const pid = proc.pid
  if (!pid) {
    proc.kill()
    return
  }

  if (process.platform === 'win32') {
    // taskkill /T = kill process tree, /F = force
    exec(`taskkill /T /F /PID ${pid}`, (err) => {
      if (err) {
        console.warn('[ytdlp] taskkill failed, fallback to proc.kill():', err.message)
        try { proc.kill() } catch {}
      }
    })
  } else {
    // Unix: kill process group
    try { process.kill(-pid, 'SIGTERM') } catch {
      try { proc.kill() } catch {}
    }
  }
}

/**
 * 应用退出时清理所有活跃的子进程
 */
export function killAllActive(): void {
  for (const [taskId, proc] of activeDownloads) {
    console.log('[ytdlp] killing active download on quit:', taskId)
    killProcessTree(proc)
  }
  activeDownloads.clear()

  for (const [taskId, proc] of activeParses) {
    console.log('[ytdlp] killing active parse on quit:', taskId)
    killProcessTree(proc)
  }
  activeParses.clear()
}

// ────────── Public API ──────────

/**
 * 检测系统中 yt-dlp 的路径和版本（同时初始化路径缓存）
 */
export async function detectYtdlp(): Promise<YtdlpInfo> {
  // 首次调用时初始化路径缓存
  if (cachedYtdlpPath === null) {
    await initPaths()
  }
  const ytdlpPath = getYtdlpPath()
  try {
    const { stdout } = await execFileAsync(ytdlpPath, ['--version'], { timeout: 5000 })
    return { available: true, path: ytdlpPath, version: stdout.trim() }
  } catch {
    return { available: false, path: '', version: '' }
  }
}

// ────────── URL 解析缓存 ──────────
interface ParseCacheEntry {
  info: VideoInfo
  timestamp: number
}
const parseCache = new Map<string, ParseCacheEntry>()
const CACHE_TTL = 1000 * 60 * 60 // 1小时缓存

/**
 * 解析视频信息（调用 yt-dlp --dump-single-json）
 * 带 10 秒超时，可通过 cancelParse 取消，附带缓存机制
 */
export async function parseVideo(url: string, proxy?: string, taskId?: string): Promise<VideoInfo> {
  const cacheKey = `${url}_${proxy || ''}`
  const cached = parseCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logInfo(`[parseVideo] returning cached result for ${url}`)
    return cached.info
  }

  const ytdlpPath = getYtdlpPath()
  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--skip-download',
    ...buildBaseArgs(proxy, url),
    url
  ]

  logInfo(`[parseVideo] starting parse for ${url}`, args)
  console.log('[ytdlp] parseVideo args:', args)

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const parseId = taskId || `parse-${Date.now()}`

    // 提取 JSON 解析逻辑供初次和 fallback 复用
    const resolveFromStdout = () => {
      try {
        const raw = JSON.parse(stdout)
        const formats: VideoFormat[] = (raw.formats ?? [])
          .filter((f: Record<string, unknown>) => String(f.protocol ?? '') !== 'mhtml')
          .map((f: Record<string, unknown>) => ({
            id: String(f.format_id ?? ''),
            ext: String(f.ext ?? ''),
            resolution: String(f.resolution ?? f.format_note ?? ''),
            filesize: typeof f.filesize === 'number' ? f.filesize : null,
            vcodec: String(f.vcodec ?? ''),
            acodec: String(f.acodec ?? ''),
            tbr: typeof f.tbr === 'number' ? f.tbr : null,
            note: String(f.format_note ?? ''),
            protocol: String(f.protocol ?? ''),
          }))
        const tags: string[] | undefined = Array.isArray(raw.tags)
          ? raw.tags.map((t: unknown) => String(t)).filter(Boolean)
          : undefined
        const categories: string[] | undefined = Array.isArray(raw.categories)
          ? raw.categories.map((c: unknown) => String(c)).filter(Boolean)
          : undefined
        const chapters: VideoChapter[] | undefined = Array.isArray(raw.chapters)
          ? raw.chapters
              .map((c: Record<string, unknown>) => ({
                title: String(c.title ?? ''),
                start_time: Number(c.start_time ?? 0),
                end_time: typeof c.end_time === 'number' ? c.end_time : undefined,
              }))
              .filter((c: VideoChapter) => c.title)
          : undefined
        const info: VideoInfo = {
          title: String(raw.title ?? ''),
          author: String(raw.uploader ?? raw.channel ?? ''),
          duration: Number(raw.duration ?? 0),
          thumbnail: String(raw.thumbnail ?? ''),
          webpage_url: String(raw.webpage_url ?? url),
          formats,
          description: typeof raw.description === 'string' ? raw.description : undefined,
          tags,
          categories,
          viewCount: typeof raw.view_count === 'number' ? raw.view_count : undefined,
          likeCount: typeof raw.like_count === 'number' ? raw.like_count : undefined,
          uploadDate: typeof raw.upload_date === 'string' ? raw.upload_date : undefined,
          chapters: chapters && chapters.length > 0 ? chapters : undefined,
        }
        parseCache.set(cacheKey, { info, timestamp: Date.now() })
        resolve(info)
      } catch (err) {
        logError(`[parseVideo] json parse error for ${url}`, err)
        reject(new Error('解析 JSON 结果失败'))
      }
    }

    const proc = spawn(ytdlpPath, args)
    activeParses.set(parseId, proc)

    // 30 秒超时
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        activeParses.delete(parseId)
        killProcessTree(proc)
        const err = new Error('解析超时（30 秒），请检查网络连接或尝试使用代理')
        logError(`[parseVideo] timeout for ${url}`, err)
        reject(err)
      }
    }, 30_000)

    const cleanup = () => {
      clearTimeout(timeout)
      activeParses.delete(parseId)
    }

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      cleanup()
      if (settled) return

      // 检查是否被取消
      if (cancelledTasks.has(parseId)) {
        settled = true
        cancelledTasks.delete(parseId)
        reject(new Error('[CANCELLED]'))
        return
      }

      if (code !== 0) {
        settled = true
        const err = new Error(stderr || `yt-dlp 退出码 ${code}`)
        logError(`[parseVideo] exit code ${code} for ${url}`, err)
        reject(err)
        return
      }

      settled = true
      resolveFromStdout()
    })

    proc.on('error', (err) => {
      cleanup()
      if (settled) return
      settled = true
      reject(new Error('启动 yt-dlp 失败：' + err.message))
    })
  })
}

/**
 * 搜索视频素材
 */
export async function searchVideos(keyword: string, limit = 20, proxy?: string): Promise<SearchResult[]> {
  const ytdlpPath = getYtdlpPath()
  const args = ['--dump-json', '--flat-playlist', ...buildBaseArgs(proxy), `ytsearch${limit}:${keyword}`]

  logInfo(`[searchVideos] starting search for "${keyword}" limit ${limit}`)
  
  const parseResultLines = (raw: string): SearchResult[] => {
    const results: SearchResult[] = []
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.startsWith('{'))
    lines.forEach(line => {
      try {
        const obj = JSON.parse(line)
        if (obj.id && obj.url) {
          results.push({
            id: String(obj.id),
            url: String(obj.url),
            title: String(obj.title || ''),
            duration: typeof obj.duration === 'number' ? obj.duration : undefined,
            author: String(obj.uploader || obj.channel || ''),
            thumbnail: obj.thumbnails && Array.isArray(obj.thumbnails)
              ? obj.thumbnails[0]?.url
              // youtube fallback
              : (obj.ie_key === 'Youtube' ? `https://i.ytimg.com/vi/${obj.id}/mqdefault.jpg` : ''),
            viewCount: typeof obj.view_count === 'number' ? obj.view_count : undefined,
            uploadDate: typeof obj.upload_date === 'string' ? obj.upload_date : undefined,
          })
        }
      } catch {
        logError(`[searchVideos] skip unparseable line:`, line)
      }
    })
    return results
  }

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const proc = spawn(ytdlpPath, args)

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        killProcessTree(proc)
        reject(new Error('搜索超时（60 秒），请检查网络连接或尝试使用代理'))
      }
    }, 60_000)

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (settled) return
      settled = true

      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp 退出码 ${code}`))
        return
      }

      resolve(parseResultLines(stdout))
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      if (settled) return
      settled = true
      reject(new Error('启动 yt-dlp 失败：' + err.message))
    })
  })
}

/**
 * 取消正在进行的解析
 */
export function cancelParse(taskId: string): boolean {
  cancelledTasks.add(taskId)
  const proc = activeParses.get(taskId)
  if (!proc) return false
  killProcessTree(proc)
  activeParses.delete(taskId)
  return true
}

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
    const proc = spawn(ytdlpPath, args)
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

/**
 * 取消指定任务的下载
 */
export function cancelDownload(taskId: string): boolean {
  // 无论进程是否存在都先标记 cancelled，防止重试等待窗口期（activeDownloads 无条目）
  // 时调用 cancel 不生效，导致 attemptDownload 下次重试仍然启动新进程
  cancelledTasks.add(taskId)
  const proc = activeDownloads.get(taskId)
  if (!proc) return false
  killProcessTree(proc)
  activeDownloads.delete(taskId)
  return true
}

/**
 * 更新 yt-dlp 到最新版本（运行 yt-dlp -U）
 */
export async function updateYtdlp(): Promise<{ success: boolean; output: string }> {
  const ytdlpPath = getYtdlpPath()
  return new Promise((resolve) => {
    let output = ''
    const proc = spawn(ytdlpPath, ['-U'], { timeout: 60_000 })
    proc.stdout.on('data', (c: Buffer) => { output += c.toString() })
    proc.stderr.on('data', (c: Buffer) => { output += c.toString() })
    proc.on('close', (code) => {
      resolve({ success: code === 0, output: output.trim().slice(-2000) })
    })
    proc.on('error', (err) => {
      resolve({ success: false, output: '启动失败：' + err.message })
    })
  })
}

/**
 * 拉取频道/播放列表的视频列表（基于 yt-dlp --flat-playlist）
 * 适用于：YouTube 频道主页、播放列表 URL 等
 */
export function fetchVideoList(url: string, limit = 30, proxy?: string): Promise<VideoListResult> {
  return new Promise((resolve, reject) => {
    const cleanUrl = url.trim()
    if (!cleanUrl) {
      reject(new Error('URL 不能为空'))
      return
    }

    const args = [
      '--dump-single-json',
      '--flat-playlist',
      '--playlist-items', `1-${limit}`,
      // flat 模式下 YouTube 默认不带 upload_date，此参数从“3 weeks ago”等文本推出近似日期
      '--extractor-args', 'youtubetab:approximate_date',
      ...buildBaseArgs(proxy),
      cleanUrl,
    ]
    const proc = spawn(getYtdlpPath(), args)
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { proc.kill() } catch {}
      reject(new Error('拉取视频列表超时（60s）'))
    }, 60_000)

    proc.stdout.on('data', (c) => { stdout += c.toString() })
    proc.stderr.on('data', (c) => { stderr += c.toString() })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim().slice(-500) || `yt-dlp 退出码 ${code}`))
        return
      }

      let root: Record<string, unknown>
      try {
        root = JSON.parse(stdout.trim())
      } catch {
        reject(new Error('解析视频列表 JSON 失败'))
        return
      }

      const channelName: string | undefined =
        (typeof root.channel === 'string' ? root.channel : undefined) ||
        (typeof root.uploader === 'string' ? root.uploader : undefined) ||
        (typeof root.title === 'string' ? root.title : undefined)

      const entries: unknown[] = Array.isArray(root.entries) ? root.entries : []
      const videos: VideoListItem[] = []

      for (const entry of entries) {
        try {
          const obj = entry as Record<string, unknown>
          if (!obj.id) continue
          const id = String(obj.id)
          const url = typeof obj.url === 'string' ? obj.url : `https://www.youtube.com/watch?v=${id}`
          const thumb = Array.isArray(obj.thumbnails) && (obj.thumbnails[0] as Record<string, unknown>)?.url
            ? String((obj.thumbnails[0] as Record<string, unknown>).url)
            : `https://i.ytimg.com/vi/${id}/mqdefault.jpg`

          let uploadDate: string | undefined
          if (typeof obj.upload_date === 'string' && /^\d{8}$/.test(obj.upload_date)) {
            uploadDate = obj.upload_date
          } else {
            const ts = typeof obj.release_timestamp === 'number' ? obj.release_timestamp
              : typeof obj.timestamp === 'number' ? obj.timestamp : null
            if (ts !== null) {
              const d = new Date(ts * 1000)
              if (!isNaN(d.getTime())) {
                uploadDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
              }
            }
          }

          const vc = obj.view_count
          videos.push({
            id,
            title: String(obj.title || ''),
            url,
            thumbnail: thumb,
            uploadDate,
            duration: typeof obj.duration === 'number' ? obj.duration : undefined,
            viewCount: typeof vc === 'number' ? vc : (typeof vc === 'string' && /^\d+$/.test(vc) ? Number(vc) : undefined),
          })
        } catch { /* skip */ }
      }

      resolve({ channelName, videos })
    })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error('启动 yt-dlp 失败：' + err.message))
    })
  })
}

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
