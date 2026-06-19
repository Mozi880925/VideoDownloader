import fs from 'fs'
import os from 'os'
import path from 'path'
import type { VideoTranscript } from '../../shared/types'
import { extractSubtitles } from './ytdlp'
import { getVideoTranscript, upsertVideoTranscript, type VideoTranscriptRow } from './db'
import { logInfo, logError } from './logger'

// ────────── 视频文案：免下载提字幕 → 纯文本入库 ──────────

export interface SrtCue {
  start: number   // 秒
  end: number
  text: string
}

/** 解析 SRT 时间戳 "00:01:23,456" → 秒 */
function parseTimestamp(ts: string): number {
  const m = ts.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / Math.pow(10, m[4].length)
}

export function parseSrt(srt: string): SrtCue[] {
  const cues: SrtCue[] = []
  // 按空行分块，兼容 \r\n
  const blocks = srt.replace(/\r/g, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim())
    if (lines.length < 2) continue
    // 第一行可能是序号，时间轴行包含 "-->"
    const timeIdx = lines.findIndex((l) => l.includes('-->'))
    if (timeIdx < 0) continue
    const [startStr, endStr] = lines[timeIdx].split('-->')
    const text = lines.slice(timeIdx + 1).join(' ')
      .replace(/<[^>]+>/g, '')   // 去掉 <font> 等标签
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    cues.push({ start: parseTimestamp(startStr), end: parseTimestamp(endStr ?? ''), text })
  }
  return cues
}

/**
 * cue 列表 → 纯文本。
 * YouTube 自动字幕滚动显示，相邻 cue 大量重复，需去重：
 * 跳过与上一条相同、或为上一条结尾子串的 cue
 */
export function cuesToText(cues: SrtCue[]): string {
  const out: string[] = []
  let prev = ''
  for (const c of cues) {
    if (!c.text || c.text === prev) continue
    if (prev && prev.endsWith(c.text)) continue
    // 自动字幕常见模式：当前 cue 以上一条结尾开头（滚动窗口），截掉重叠部分
    let text = c.text
    if (prev) {
      for (let overlap = Math.min(prev.length, text.length); overlap > 10; overlap--) {
        if (prev.endsWith(text.slice(0, overlap))) {
          text = text.slice(overlap).trim()
          break
        }
      }
    }
    if (text) out.push(text)
    prev = c.text
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/** 提取前 N 秒的文案（开头钩子分析用） */
export function firstSecondsText(srt: string, seconds: number): string {
  const cues = parseSrt(srt).filter((c) => c.start < seconds)
  return cuesToText(cues)
}

/** 从字幕文件名推断语言代码：Title.zh-Hans.srt → zh-Hans */
function langFromFilename(p: string): string {
  const m = path.basename(p).match(/\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)\.srt$/i)
  return m ? m[1] : ''
}

/** 多个字幕文件时优先中文，其次英文 */
function pickBestSrt(paths: string[]): string {
  const score = (p: string) => {
    const lang = langFromFilename(p).toLowerCase()
    if (lang.startsWith('zh')) return 0
    if (lang.startsWith('en')) return 1
    return 2
  }
  return [...paths].sort((a, b) => score(a) - score(b))[0]
}

function rowToTranscript(r: VideoTranscriptRow): VideoTranscript {
  return {
    videoId: r.video_id,
    channelId: r.channel_id,
    url: r.url,
    title: r.title,
    language: r.language,
    text: r.text,
    createdAt: r.created_at,
  }
}

export function getCachedTranscript(videoId: string, channelId: string): VideoTranscript | null {
  const row = getVideoTranscript(videoId, channelId)
  return row ? rowToTranscript(row) : null
}

/** 获取缓存的开头文案（前 N 秒），无缓存返回 null */
export function getCachedOpeningText(videoId: string, channelId: string, seconds = 90): string | null {
  const row = getVideoTranscript(videoId, channelId)
  if (!row) return null
  return row.srt ? firstSecondsText(row.srt, seconds) : row.text.slice(0, 600)
}

/**
 * 提取视频文案：缓存命中直接返回；否则 yt-dlp 提字幕到临时目录 → 解析 → 入库 → 清理
 */
export async function fetchTranscript(
  video: { id: string; channelId: string; url: string; title: string },
  force = false,
): Promise<VideoTranscript> {
  if (!force) {
    const cached = getVideoTranscript(video.id, video.channelId)
    if (cached) {
      logInfo(`[transcript] cache hit for ${video.id}`)
      return rowToTranscript(cached)
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vdl-transcript-'))
  try {
    logInfo(`[transcript] extracting subtitles for ${video.url}`)
    const result = await extractSubtitles(video.url, tmpDir)
    if (result.status !== 'success' || !result.srtPaths?.length) {
      throw new Error(result.errorMessage || '该视频没有可提取的字幕')
    }

    const srtPath = pickBestSrt(result.srtPaths)
    const srt = fs.readFileSync(srtPath, 'utf-8')
    const text = cuesToText(parseSrt(srt))
    if (!text) throw new Error('字幕内容为空')

    const row: VideoTranscriptRow = {
      video_id: video.id,
      channel_id: video.channelId,
      url: video.url,
      title: result.title || video.title,
      language: langFromFilename(srtPath),
      srt,
      text,
      created_at: Date.now(),
    }
    upsertVideoTranscript(row)
    logInfo(`[transcript] saved for ${video.id}: lang=${row.language}, ${text.length} chars`)
    return rowToTranscript(row)
  } catch (err) {
    logError(`[transcript] failed for ${video.url}`, err instanceof Error ? err : new Error(String(err)))
    throw err
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}
