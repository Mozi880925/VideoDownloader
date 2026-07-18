import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import type { VideoInfo, VideoFormat, VideoChapter, YtdlpInfo, SearchResult } from '../../../shared/types'
import { logInfo, logError } from '../logger'
import { initPaths, pathsInitialized, getYtdlpPath } from '../toolPaths'
import { killProcessTree } from '../processUtils'
import { buildBaseArgs, ytdlpSpawnEnv } from './config'
import { activeParses, cancelledTasks } from './registry'

const execFileAsync = promisify(execFile)

/**
 * 检测系统中 yt-dlp 的路径和版本（同时初始化路径缓存）
 */
export async function detectYtdlp(): Promise<YtdlpInfo> {
  // 首次调用时初始化路径缓存
  if (!pathsInitialized()) {
    await initPaths()
  }
  const ytdlpPath = getYtdlpPath()
  try {
    const { stdout } = await execFileAsync(ytdlpPath, ['--version'], { timeout: 5000, env: ytdlpSpawnEnv() })
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
 * 带 30 秒超时，可通过 cancelParse 取消，附带缓存机制
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

    const proc = spawn(ytdlpPath, args, { env: ytdlpSpawnEnv() })
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

    const proc = spawn(ytdlpPath, args, { env: ytdlpSpawnEnv() })

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
 * 更新 yt-dlp 到最新版本（运行 yt-dlp -U）
 */
export async function updateYtdlp(): Promise<{ success: boolean; output: string }> {
  const ytdlpPath = getYtdlpPath()
  return new Promise((resolve) => {
    let output = ''
    const proc = spawn(ytdlpPath, ['-U'], { timeout: 60_000, env: ytdlpSpawnEnv() })
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
