import type { ChannelSubscription, NewVideoItem, CheckInterval, VideoListItem } from '../../shared/types'
import { fetchVideoList } from './ytdlp'
import {
  listSubscriptions as dbList,
  getSubscription as dbGet,
  insertSubscription as dbInsert,
  updateSubscriptionCheckState,
  updateSubscriptionEnabled,
  updateSubscriptionGroup as dbUpdateGroup,
  updateSubscriptionPinned as dbUpdatePinned,
  deleteSubscription as dbDelete,
  insertNewVideos,
  listNewVideos as dbListNewVideos,
  dismissNewVideo as dbDismiss,
  clearNewVideos as dbClear,
  insertViewSnapshots,
  pruneViewSnapshots,
  type ChannelSubscriptionRow,
  type NewVideoRow,
} from './db'
import { queueHotVideos } from './autoAnalysis'
import { logInfo, logError } from './logger'

// ────────── 类型转换 ──────────

function rowToSubscription(r: ChannelSubscriptionRow): ChannelSubscription {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    lastCheckedAt: r.last_checked_at,
    enabled: r.enabled === 1,
    newCount: r.new_count ?? 0,
    group: r.group_name || undefined,
    pinned: r.pinned === 1,
  }
}

function rowToNewVideo(r: NewVideoRow): NewVideoItem {
  return {
    id: r.id,
    channelId: r.channel_id,
    title: r.title,
    url: r.url,
    thumbnail: r.thumbnail,
    uploadDate: r.upload_date || undefined,
    duration: r.duration || undefined,
    viewCount: r.view_count || undefined,
    discoveredAt: r.discovered_at,
    // 注意：seen（基线缓存）不能映射成 new，否则旧视频会被错误高亮为新视频
    status: r.status === 'new' ? 'new' : r.status === 'dismissed' ? 'dismissed' : 'seen',
  }
}

function genId(): string {
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ────────── Public API ──────────

export function listSubscriptions(): ChannelSubscription[] {
  return dbList().map(rowToSubscription)
}

export function listNewVideos(channelId?: string): NewVideoItem[] {
  return dbListNewVideos(channelId).map(rowToNewVideo)
}

/** 添加订阅：拉一次视频列表，把这些 ID 作为 baseline，不通知为新视频 */
export async function addSubscription(url: string, customName?: string): Promise<ChannelSubscription> {
  const cleanUrl = url.trim()
  if (!cleanUrl) throw new Error('URL 不能为空')
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error('URL 格式不正确（需以 http/https 开头）')

  // 去重：同 URL 直接返回已存在的
  for (const existing of dbList()) {
    if (existing.url === cleanUrl) {
      throw new Error('该订阅已存在：' + (existing.name || existing.url))
    }
  }

  logInfo(`[subscription] adding ${cleanUrl}`)
  const fetched = await fetchVideoList(cleanUrl, 20)
  const id = genId()
  const now = Date.now()
  const row: Omit<ChannelSubscriptionRow, 'new_count'> = {
    id,
    name: customName || fetched.channelName || '未命名频道',
    url: cleanUrl,
    last_checked_at: now,
    last_seen_ids: JSON.stringify(fetched.videos.map((v) => v.id)),
    enabled: 1,
    created_at: now,
    group_name: '',
    pinned: 0,
  }
  dbInsert(row)

  // 把基线视频写入 channel_new_videos 表（status='seen'），供卡片立即展示
  const baselineRows: NewVideoRow[] = fetched.videos.map((v) => ({
    id: v.id,
    channel_id: id,
    title: v.title,
    url: v.url,
    thumbnail: v.thumbnail,
    upload_date: v.uploadDate ?? '',
    duration: v.duration ?? 0,
    view_count: v.viewCount ?? 0,
    discovered_at: now,
    status: 'seen' as const,
  }))
  insertNewVideos(baselineRows)

  logInfo(`[subscription] added ${row.name} with ${fetched.videos.length} baseline videos (cached as seen)`)
  const created = dbGet(id)
  if (!created) throw new Error('插入订阅后无法回读')
  return rowToSubscription(created)
}

export function removeSubscription(id: string): void {
  dbDelete(id)
}

export function toggleSubscription(id: string, enabled: boolean): void {
  updateSubscriptionEnabled(id, enabled)
}

export function setSubscriptionGroup(id: string, groupName: string): void {
  dbUpdateGroup(id, groupName ?? '')
}

export function setSubscriptionPinned(id: string, pinned: boolean): void {
  dbUpdatePinned(id, pinned)
}

export function dismissNewVideo(videoId: string, channelId: string): void {
  dbDismiss(videoId, channelId)
}

export function clearNewVideos(channelId: string): number {
  return dbClear(channelId)
}

/** 检查单个订阅：返回新增的视频数组（如果有） */
export async function checkSubscription(id: string): Promise<NewVideoItem[]> {
  const row = dbGet(id)
  if (!row) throw new Error('订阅不存在')

  const fetched = await fetchVideoList(row.url, 20)
  const seen: string[] = (() => {
    try { return JSON.parse(row.last_seen_ids) as string[] } catch { return [] }
  })()
  const seenSet = new Set(seen)

  const now = Date.now()
  const newOnes = fetched.videos.filter((v) => !seenSet.has(v.id))

  const rowsToInsert: NewVideoRow[] = newOnes.map((v) => ({
    id: v.id,
    channel_id: id,
    title: v.title,
    url: v.url,
    thumbnail: v.thumbnail,
    upload_date: v.uploadDate ?? '',
    duration: v.duration ?? 0,
    view_count: v.viewCount ?? 0,
    discovered_at: now,
    status: 'new',
  }))
  const inserted = insertNewVideos(rowsToInsert)

  // 把本次拉取中已存在于 seenSet 的视频也写入缓存（UPSERT：已有行只刷新播放量等元数据，status 不变）
  const alreadySeenRows: NewVideoRow[] = fetched.videos
    .filter((v) => seenSet.has(v.id))
    .map((v) => ({
      id: v.id,
      channel_id: id,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      upload_date: v.uploadDate ?? '',
      duration: v.duration ?? 0,
      view_count: v.viewCount ?? 0,
      discovered_at: now,
      status: 'seen' as const,
    }))
  insertNewVideos(alreadySeenRows)

  // 更新 last_seen_ids（合并新旧，去重，保留最多 200 个防止无限增长）
  const mergedIds = Array.from(new Set([...fetched.videos.map((v) => v.id), ...seen])).slice(0, 200)
  updateSubscriptionCheckState(id, now, JSON.stringify(mergedIds))

  // 播放量快照：每次检查记录一次，用于计算增速（提前发现正在爬坡的爆款）
  try {
    insertViewSnapshots(
      fetched.videos
        .filter((v) => (v.viewCount ?? 0) > 0)
        .map((v) => ({ video_id: v.id, channel_id: id, view_count: v.viewCount as number })),
    )
    pruneViewSnapshots()
  } catch (err) {
    logError('[subscription] snapshot insert failed', err instanceof Error ? err : new Error(String(err)))
  }

  logInfo(`[subscription] checked ${row.name}: fetched=${fetched.videos.length}, new=${newOnes.length}, inserted=${inserted}`)

  // 返回真正新插入的视频（按 newOnes 顺序）
  const newItems = newOnes
    .filter((v) => rowsToInsert.some((r) => r.id === v.id))
    .map<NewVideoItem>((v) => ({
      id: v.id,
      channelId: id,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      uploadDate: v.uploadDate,
      duration: v.duration,
      viewCount: v.viewCount,
      discoveredAt: now,
      status: 'new',
    }))

  // 爆款新视频自动 AI 拆解（开关关闭/未配置 LLM 时为 no-op，fire-and-forget 不阻塞检查）
  queueHotVideos(id, row.name, newItems)

  return newItems
}

/** 检查所有启用的订阅 */
export async function checkAllSubscriptions(
  onEachResult?: (subId: string, subName: string, newVideos: NewVideoItem[], err?: Error) => void,
): Promise<void> {
  const subs = dbList().filter((s) => s.enabled === 1)
  for (const s of subs) {
    try {
      const newVideos = await checkSubscription(s.id)
      onEachResult?.(s.id, s.name, newVideos)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      logError(`[subscription] check failed for ${s.name}`, e)
      onEachResult?.(s.id, s.name, [], e)
    }
  }
}

// ────────── 定时检查 ──────────

let scheduleTimer: NodeJS.Timeout | null = null

function intervalMs(i: CheckInterval): number {
  switch (i) {
    case 'hourly': return 60 * 60 * 1000
    case '6h':    return 6 * 60 * 60 * 1000
    case 'daily': return 24 * 60 * 60 * 1000
    default:      return 0
  }
}

export function startScheduler(
  interval: CheckInterval,
  onBatchDone?: (results: { subId: string; subName: string; newVideos: NewVideoItem[]; err?: Error }[]) => void,
): void {
  stopScheduler()
  const ms = intervalMs(interval)
  if (ms <= 0) {
    logInfo('[subscription] scheduler off')
    return
  }
  logInfo(`[subscription] scheduler started, interval=${ms}ms`)
  scheduleTimer = setInterval(async () => {
    const results: { subId: string; subName: string; newVideos: NewVideoItem[]; err?: Error }[] = []
    await checkAllSubscriptions((id, name, newVids, err) => {
      results.push({ subId: id, subName: name, newVideos: newVids, err })
    })
    if (onBatchDone) onBatchDone(results)
  }, ms)
}

export function stopScheduler(): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer)
    scheduleTimer = null
    logInfo('[subscription] scheduler stopped')
  }
}
