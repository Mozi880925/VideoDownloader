import { spawn } from 'child_process'
import type { VideoListItem, VideoListResult } from '../../../shared/types'
import { logInfo } from '../logger'
import { isoToUploadDate } from '../../../shared/dateUtils'
import { fetchChannelVideosViaApi } from '../youtubeApi'
import { getYtdlpPath } from '../toolPaths'
import { buildBaseArgs, ytdlpSpawnEnv } from './config'

/**
 * YouTube RSS 订阅源：补全 flat-playlist 拿不到的播放量和精确发布时间。
 * 现版 yt-dlp 在 /videos 页签 flat 模式下不返回 view_count（YouTube 改版），
 * 而 RSS（feeds/videos.xml）自带 media:statistics views 和 published，覆盖最新 15 条。
 */
async function fetchYoutubeRssStats(
  channelId: string,
): Promise<Map<string, { views?: number; published?: string }>> {
  const { net } = await import('electron')
  const stats = new Map<string, { views?: number; published?: string }>()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const resp = await net.fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      signal: controller.signal,
    })
    if (!resp.ok) return stats
    const xml = await resp.text()
    for (const entry of xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []) {
      const id = entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/)?.[1]
      if (!id) continue
      const views = entry.match(/<media:statistics[^>]*\bviews="(\d+)"/)?.[1]
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1]
      stats.set(id, {
        views: views ? Number(views) : undefined,
        published: published || undefined,
      })
    }
    logInfo(`[fetchVideoList] RSS stats merged for channel ${channelId}: ${stats.size} entries`)
  } catch (err) {
    logInfo(`[fetchVideoList] RSS fetch failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
  return stats
}

/**
 * 拉取频道/播放列表的视频列表。
 * 配置了 YouTube Data API Key 且 URL 是频道地址时走官方 API（精确播放量，全量覆盖）；
 * 否则（无 Key / 播放列表 / 其他平台 / API 出错）回落 yt-dlp --flat-playlist。
 */
export async function fetchVideoList(url: string, limit = 30, proxy?: string): Promise<VideoListResult> {
  try {
    const viaApi = await fetchChannelVideosViaApi(url, limit)
    if (viaApi) return viaApi
  } catch (err) {
    logInfo(`[fetchVideoList] YouTube API failed, falling back to yt-dlp: ${err instanceof Error ? err.message : String(err)}`)
  }
  return fetchVideoListViaYtdlp(url, limit, proxy)
}

/** yt-dlp --flat-playlist 路径（YouTube 频道主页、播放列表、抖音等） */
function fetchVideoListViaYtdlp(url: string, limit = 30, proxy?: string): Promise<VideoListResult> {
  return new Promise((resolve, reject) => {
    let cleanUrl = url.trim()
    if (!cleanUrl) {
      reject(new Error('URL 不能为空'))
      return
    }

    // YouTube 频道根地址 → /videos 页签：根地址在 flat 模式下只返回页签播放列表（"xxx - Videos"），不是视频
    const ytRoot = cleanUrl.match(
      /^(https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:@[\w.-]+|channel\/[\w-]+|c\/[^/?#]+|user\/[^/?#]+))\/?(?:[?#].*)?$/i,
    )
    if (ytRoot) {
      cleanUrl = ytRoot[1] + '/videos'
      logInfo(`[fetchVideoList] channel root URL rewritten to videos tab: ${cleanUrl}`)
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
    const proc = spawn(getYtdlpPath(), args, { env: ytdlpSpawnEnv() })
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

    proc.on('close', async (code) => {
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

      const isYoutubeTab = root.extractor_key === 'YoutubeTab'
      const entries: unknown[] = Array.isArray(root.entries) ? root.entries : []
      const videos: VideoListItem[] = []

      for (const entry of entries) {
        try {
          const obj = entry as Record<string, unknown>
          if (!obj.id) continue
          // YouTube 页签提取时只保留真正的视频条目，跳过嵌套的页签/播放列表（如 "xxx - Shorts"）
          if (isYoutubeTab && obj.ie_key !== 'Youtube') continue
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

      // YouTube /videos 页签 flat 模式拿不到播放量 → 用频道 RSS 补全（播放量 + 精确发布日期，最新 15 条）
      const channelId = typeof root.channel_id === 'string' ? root.channel_id : ''
      if (isYoutubeTab && channelId.startsWith('UC') && videos.some((v) => v.viewCount === undefined)) {
        const stats = await fetchYoutubeRssStats(channelId)
        for (const v of videos) {
          const s = stats.get(v.id)
          if (!s) continue
          if (v.viewCount === undefined && s.views !== undefined) v.viewCount = s.views
          if (s.published) {
            const exact = isoToUploadDate(s.published)
            if (exact) v.uploadDate = exact   // RSS 的发布时间比 approximate_date 推算的更准
          }
        }
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
