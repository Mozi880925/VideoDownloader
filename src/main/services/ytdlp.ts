import { spawn, exec } from 'child_process'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import type {
  VideoInfo,
  VideoFormat,
  DownloadOptions,
  DownloadProgress,
  YtdlpInfo,
  SearchResult,
} from '../../shared/types'
import { logInfo, logError } from './logger'

const execFileAsync = promisify(execFile)

// ────────── Path cache ──────────

let cachedYtdlpPath: string | null = null
let cachedJsRuntime: { kind: 'node' | 'deno'; path: string } | null | undefined = undefined  // undefined = not yet resolved
let cachedFfmpegPath: string | null | undefined = undefined  // undefined = not yet resolved

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
  // 检测 Node（已知路径优先）
  const knownNode = 'C:\\Program Files\\nodejs\\node.exe'
  if (fs.existsSync(knownNode)) return { kind: 'node', path: knownNode }
  const node = await whichAsync('node')
  if (node) return { kind: 'node', path: node }
  return null
}

async function resolveFfmpegPathAsync(): Promise<string | null> {
  return whichAsync('ffmpeg')
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

  console.log('[ytdlp] resolved yt-dlp  :', cachedYtdlpPath, '| exists:', fs.existsSync(cachedYtdlpPath))
  console.log('[ytdlp] resolved ffmpeg  :', cachedFfmpegPath ?? 'not found', '| exists:', cachedFfmpegPath ? fs.existsSync(cachedFfmpegPath) : false)
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

// ────────── Cookies file path (set by renderer via IPC on startup / settings change) ──────────

let cachedCookiesPath = ''

export function setCookiesPath(filePath: string): void {
  cachedCookiesPath = filePath
  logInfo(`[ytdlp] cookies path updated: ${filePath || '(none)'}`)
}

// ────────── Shared base args ──────────

function buildBaseArgs(proxy?: string): string[] {
  const args: string[] = ['--no-warnings']

  if (proxy) args.push('--proxy', proxy)

  const js = getJsRuntime()
  if (js) args.push('--js-runtimes', `${js.kind}:${js.path}`)
  else console.warn('[ytdlp] No JS runtime found — YouTube n-challenge may fail')

  // 有效 cookies 文件则传入，否则不加（无 cookie 直接下载公开内容）
  if (cachedCookiesPath && fs.existsSync(cachedCookiesPath)) {
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
    ...buildBaseArgs(proxy),
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
        const info: VideoInfo = {
          title: String(raw.title ?? ''),
          author: String(raw.uploader ?? raw.channel ?? ''),
          duration: Number(raw.duration ?? 0),
          thumbnail: String(raw.thumbnail ?? ''),
          webpage_url: String(raw.webpage_url ?? url),
          formats,
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
  const { url, formatId, outputPath, proxy, taskId } = options
  const ytdlpPath = getYtdlpPath()
  const ffmpegPath = getFfmpegPath()

  const args = [...buildBaseArgs(proxy)]

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

  args.push('-o', outputPath)
  args.push('--windows-filenames')
  // 优化下载参数：禁用 part、开启 5 并发分片（默认不限速）
  args.push('--continue', '--no-overwrites', '--no-part')
  args.push('--concurrent-fragments', '5')
  
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath)

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
        const checkFile = finalFilepath || fallbackFilepath
        if (!checkFile || !fs.existsSync(checkFile)) {
          downloadErr = new Error('下载似乎完成但未找到最终文件，请检查输出目录')
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
