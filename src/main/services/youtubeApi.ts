import { net } from 'electron'
import type { VideoListItem, VideoListResult } from '../../shared/types'
import { logInfo, logError } from './logger'

// ────────── YouTube Data API v3 ──────────
// 配置 API Key 后，频道视频列表 + 精确播放量改走官方 API（监控排行榜网站同款方案）：
//   channels.list（解析频道 ID，1 单位）→ playlistItems.list（视频列表，1 单位）
//   → videos.list（50 条/请求的精确统计，1 单位）
// 每日免费配额 10,000 单位，单频道一次检查约 2~3 单位，完全用不完。

const API_BASE = 'https://www.googleapis.com/youtube/v3'

let apiKey: string | null = null

export function setYoutubeApiKey(key: string | null): void {
  apiKey = key?.trim() || null
  logInfo(`[ytapi] api key ${apiKey ? 'set' : 'cleared'}`)
}

export function hasYoutubeApiKey(): boolean {
  return !!apiKey
}

// URL → 频道 ID 解析结果缓存（进程生命周期内有效，省配额）
const channelCache = new Map<string, { channelId: string; title: string }>()

async function apiGet(
  endpoint: string,
  params: Record<string, string>,
  key: string,
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, key }).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const resp = await net.fetch(`${API_BASE}/${endpoint}?${qs}`, { signal: controller.signal })
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    if (!resp.ok) {
      const apiErr = (json as { error?: { message?: string; errors?: { reason?: string }[] } }).error
      const reason = apiErr?.errors?.[0]?.reason ?? ''
      if (reason === 'quotaExceeded') throw new Error('YouTube API 今日配额已用完（太平洋时间 0 点重置）')
      if (resp.status === 400 && /API key/i.test(apiErr?.message ?? '')) throw new Error('API Key 无效，请检查设置')
      if (resp.status === 403) throw new Error(`YouTube API 拒绝请求：${apiErr?.message ?? resp.status}`)
      throw new Error(`YouTube API 返回 ${resp.status}：${(apiErr?.message ?? '').slice(0, 200)}`)
    }
    return json
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('YouTube API 请求超时（20s）')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** ISO8601 时长（PT1H2M3S）→ 秒 */
function parseIsoDuration(iso: string): number | undefined {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return undefined
  const [, d, h, min, s] = m
  return (Number(d) || 0) * 86400 + (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0)
}

/** ISO 时间 → YYYYMMDD */
function isoToUploadDate(iso: string): string | undefined {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

interface ParsedChannelUrl {
  lookup: { param: 'forHandle' | 'forUsername' | 'id'; value: string }
  tab: 'videos' | 'shorts' | 'root'
}

/** 解析 YouTube 频道 URL；不是可识别的频道地址（播放列表、c/ 旧链接等）返回 null → 走 yt-dlp */
function parseChannelUrl(url: string): ParsedChannelUrl | null {
  const m = url
    .trim()
    .match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/(@[\w.-]+|channel\/[\w-]+|user\/[\w.-]+)(?:\/(videos|shorts))?\/?(?:[?#].*)?$/i)
  if (!m) return null
  const [, base, tabRaw] = m
  const tab = (tabRaw?.toLowerCase() as 'videos' | 'shorts') || 'root'
  if (base.startsWith('@')) return { lookup: { param: 'forHandle', value: base }, tab }
  if (base.toLowerCase().startsWith('channel/')) return { lookup: { param: 'id', value: base.slice(8) }, tab }
  return { lookup: { param: 'forUsername', value: base.slice(5) }, tab }
}

async function resolveChannel(url: string, key: string): Promise<{ channelId: string; title: string; tab: ParsedChannelUrl['tab'] } | null> {
  const parsed = parseChannelUrl(url)
  if (!parsed) return null
  const cacheKey = `${parsed.lookup.param}:${parsed.lookup.value}`
  const cached = channelCache.get(cacheKey)
  if (cached) return { ...cached, tab: parsed.tab }

  const json = await apiGet('channels', { part: 'snippet', [parsed.lookup.param]: parsed.lookup.value }, key)
  const item = (json.items as Record<string, unknown>[] | undefined)?.[0]
  if (!item) throw new Error('YouTube API 找不到该频道，请检查 URL')
  const channelId = String(item.id)
  const title = String((item.snippet as Record<string, unknown>)?.title ?? '')
  channelCache.set(cacheKey, { channelId, title })
  return { channelId, title, tab: parsed.tab }
}

/** 频道上传播放列表 ID：UULF=长视频、UUSH=Shorts、UU=全部上传 */
function uploadsPlaylistId(channelId: string, tab: ParsedChannelUrl['tab']): string {
  const suffix = channelId.slice(2)   // 去掉 UC 前缀
  if (tab === 'shorts') return 'UUSH' + suffix
  return 'UULF' + suffix              // root 已统一按长视频处理（与 yt-dlp 路径的 /videos 改写一致）
}

interface PlaylistVideo {
  id: string
  title: string
  thumbnail: string
  publishedAt: string
}

async function listPlaylistVideos(playlistId: string, limit: number, key: string): Promise<PlaylistVideo[]> {
  const json = await apiGet('playlistItems', {
    part: 'snippet',
    playlistId,
    maxResults: String(Math.min(limit, 50)),
  }, key)
  const items = (json.items as Record<string, unknown>[] | undefined) ?? []
  const videos: PlaylistVideo[] = []
  for (const it of items) {
    const sn = it.snippet as Record<string, unknown> | undefined
    if (!sn) continue
    const vid = ((sn.resourceId as Record<string, unknown>)?.videoId ?? '') as string
    if (!vid) continue
    const thumbs = sn.thumbnails as Record<string, { url?: string }> | undefined
    videos.push({
      id: vid,
      title: String(sn.title ?? ''),
      thumbnail: thumbs?.medium?.url || thumbs?.high?.url || thumbs?.default?.url || `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
      publishedAt: String(sn.publishedAt ?? ''),
    })
  }
  return videos
}

/** videos.list 批量拉精确统计（≤50 条/请求） */
async function fetchVideoStats(ids: string[], key: string): Promise<Map<string, { views?: number; duration?: number }>> {
  const stats = new Map<string, { views?: number; duration?: number }>()
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const json = await apiGet('videos', { part: 'statistics,contentDetails', id: batch.join(',') }, key)
    for (const it of (json.items as Record<string, unknown>[] | undefined) ?? []) {
      const id = String(it.id)
      const st = it.statistics as Record<string, unknown> | undefined
      const cd = it.contentDetails as Record<string, unknown> | undefined
      stats.set(id, {
        views: st?.viewCount !== undefined ? Number(st.viewCount) : undefined,
        duration: typeof cd?.duration === 'string' ? parseIsoDuration(cd.duration) : undefined,
      })
    }
  }
  return stats
}

/**
 * 通过官方 API 拉取频道视频列表。
 * 返回 null 表示不适用（未配置 Key / 不是可识别的频道 URL）→ 调用方回落 yt-dlp。
 * API 报错时抛出，由调用方决定是否回落。
 */
export async function fetchChannelVideosViaApi(url: string, limit = 20): Promise<VideoListResult | null> {
  const key = apiKey
  if (!key) return null
  const resolved = await resolveChannel(url, key)
  if (!resolved) return null

  let playlistVideos: PlaylistVideo[]
  try {
    playlistVideos = await listPlaylistVideos(uploadsPlaylistId(resolved.channelId, resolved.tab), limit, key)
  } catch {
    // 个别频道没有 UULF/UUSH 特殊播放列表 → 回落到全部上传（UU）
    playlistVideos = await listPlaylistVideos('UU' + resolved.channelId.slice(2), limit, key)
  }

  const stats = await fetchVideoStats(playlistVideos.map((v) => v.id), key)
  const videos: VideoListItem[] = playlistVideos.map((v) => {
    const s = stats.get(v.id)
    return {
      id: v.id,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: v.thumbnail,
      uploadDate: isoToUploadDate(v.publishedAt),
      duration: s?.duration,
      viewCount: s?.views,
    }
  })

  logInfo(`[ytapi] fetched ${videos.length} videos for ${resolved.title} (${resolved.channelId}, tab=${resolved.tab})`)
  return { channelName: resolved.title, videos }
}

/** 测试 API Key：用官方 @YouTube 频道做一次最小查询 */
export async function testYoutubeApiKey(key: string): Promise<{ ok: boolean; message: string }> {
  const k = key?.trim()
  if (!k) return { ok: false, message: '请先填写 API Key' }
  try {
    const json = await apiGet('channels', { part: 'snippet', forHandle: '@YouTube' }, k)
    const title = ((json.items as Record<string, unknown>[] | undefined)?.[0]?.snippet as Record<string, unknown>)?.title
    return { ok: true, message: `连接成功（测试查询返回：${String(title ?? 'OK')}）` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError('[ytapi] key test failed', err instanceof Error ? err : new Error(msg))
    return { ok: false, message: msg }
  }
}
