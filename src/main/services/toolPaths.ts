import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'

const execFileAsync = promisify(execFile)

// ────────── 外部工具路径解析与缓存（yt-dlp / JS runtime / ffmpeg / ffprobe）──────────

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

/** 路径缓存是否已初始化（detectYtdlp 懒初始化用） */
export function pathsInitialized(): boolean {
  return cachedYtdlpPath !== null
}

// ────────── Cached getters (sync, zero-cost) ──────────

export function getYtdlpPath(): string {
  return cachedYtdlpPath || 'yt-dlp'
}

export function getJsRuntime(): { kind: 'node' | 'deno'; path: string } | null {
  return cachedJsRuntime ?? null
}

export function getFfmpegPath(): string | null {
  return cachedFfmpegPath ?? null
}

export function getFfprobePath(): string | null {
  return cachedFfprobePath ?? null
}
