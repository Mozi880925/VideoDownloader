import type { NewVideoItem, TitleAnalysisResult } from '../../shared/types'
import { analyzeTitle, getLlmRuntimeConfig } from './llm'
import { fetchTranscript, getCachedOpeningText } from './transcript'
import {
  getVideoAnalysis,
  upsertVideoAnalysis,
  listNewVideos as dbListNewVideos,
} from './db'
import { logInfo, logError } from './logger'

// ────────── 爆款新视频自动 AI 拆解 ──────────
// 检查订阅发现新视频后，对命中爆款阈值（频道播放量中位数 × 2，样本 ≥ 5）的视频
// 自动跑「提取文案 + 标题/钩子拆解」并入库。串行队列，避免并发打爆 LLM API。

let enabled = false

export function setAutoAnalyzeEnabled(on: boolean): void {
  enabled = on
  logInfo(`[autoAnalysis] ${on ? 'enabled' : 'disabled'}`)
}

type DoneNotifier = (info: { channelId: string; channelName: string; videoId: string; videoTitle: string }) => void
let notifier: DoneNotifier | null = null

export function setAutoAnalysisNotifier(fn: DoneNotifier): void {
  notifier = fn
}

interface QueueItem {
  video: NewVideoItem
  channelName: string
}

const queue: QueueItem[] = []
let processing = false

/** 计算频道爆款阈值：播放量中位数 × 2，有效样本不足 5 时返回 null（与渲染端逻辑一致） */
function hotThreshold(channelId: string): number | null {
  const views = dbListNewVideos(channelId)
    .map((r) => r.view_count)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  if (views.length < 5) return null
  return views[Math.floor(views.length / 2)] * 2
}

/** 检查后调用：筛出爆款新视频，进自动拆解队列 */
export function queueHotVideos(channelId: string, channelName: string, newVideos: NewVideoItem[]): void {
  if (!enabled || newVideos.length === 0) return
  if (!getLlmRuntimeConfig()) return
  const threshold = hotThreshold(channelId)
  if (!threshold) return

  for (const v of newVideos) {
    if ((v.viewCount ?? 0) < threshold) continue
    if (getVideoAnalysis(v.id, channelId)) continue
    if (queue.some((q) => q.video.id === v.id && q.video.channelId === channelId)) continue
    queue.push({ video: v, channelName })
    logInfo(`[autoAnalysis] queued hot video: ${v.title} (${v.viewCount} >= ${threshold})`)
  }
  void processQueue()
}

async function processQueue(): Promise<void> {
  if (processing) return
  processing = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()!
      try {
        await analyzeOne(item)
      } catch (err) {
        logError(`[autoAnalysis] failed for ${item.video.title}`, err instanceof Error ? err : new Error(String(err)))
      }
    }
  } finally {
    processing = false
  }
}

async function analyzeOne({ video, channelName }: QueueItem): Promise<void> {
  const cfg = getLlmRuntimeConfig()
  if (!cfg) return

  // 提取开头文案（前 90 秒），失败不阻塞
  let openingText: string | undefined
  try {
    await fetchTranscript({ id: video.id, channelId: video.channelId, url: video.url, title: video.title })
    openingText = getCachedOpeningText(video.id, video.channelId) ?? undefined
  } catch { /* 无字幕则纯标题分析 */ }

  // 同频道近期视频做对照
  const siblings = dbListNewVideos(video.channelId)
    .filter((r) => r.id !== video.id)
    .slice(0, 20)
    .map((r) => ({ title: r.title, viewCount: r.view_count || undefined }))

  const result = await analyzeTitle(cfg, {
    title: video.title,
    viewCount: video.viewCount,
    channelName,
    siblings,
    openingText,
  })

  saveAnalysis(video.id, video.channelId, video.title, result, !!openingText, true)
  logInfo(`[autoAnalysis] done: ${video.title}`)
  notifier?.({ channelId: video.channelId, channelName, videoId: video.id, videoTitle: video.title })
}

/** 拆解结果入库（手动分析也复用此函数） */
export function saveAnalysis(
  videoId: string,
  channelId: string,
  title: string,
  result: TitleAnalysisResult,
  usedOpening: boolean,
  auto: boolean,
): void {
  upsertVideoAnalysis({
    video_id: videoId,
    channel_id: channelId,
    title,
    result_json: JSON.stringify(result),
    used_opening: usedOpening ? 1 : 0,
    auto: auto ? 1 : 0,
    created_at: Date.now(),
  })
}
