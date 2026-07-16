import type { RadarScanProgress } from '../../shared/types'
import { logInfo, logError } from './logger'
import { ytApiGet, hasYoutubeApiKey } from './youtubeApi'
import { canSpend, getUsedToday, endpointCost } from './youtubeQuota'
import {
  listRadarKeywords,
  touchRadarKeywordScanned,
  upsertRadarChannel,
  insertRadarSnapshot,
  insertRadarScanRun,
  updateRadarScanRun,
} from './db'

// ────────── 蓝海雷达：每日定额扫描 ──────────
// 流程：启用的关键词逐个 search.list（100 单位/次，取近 90 天视频一页 50 条）
//       → 收集去重 channelId → channels.list 批量拉详情（50 个/次，1 单位）
//       → upsert 频道库 + 记快照。
// 配额策略：每个 search 前用 canSpend() 检查余量（默认给订阅检查留 1000 单位保底），
//           不足则提前收口，已入库结果保留——「每天一个切片、靠时间攒厚度」。

/** search.list 只看近 N 天发布的视频（活跃频道信号） */
const SEARCH_WINDOW_DAYS = 90
/** 每个关键词抓一页（50 条结果，100 单位） */
const SEARCH_MAX_RESULTS = 50

let scanning = false
let stopRequested = false

export function isScanning(): boolean {
  return scanning
}

export function requestStopScan(): void {
  if (scanning) {
    stopRequested = true
    logInfo('[radar] stop requested')
  }
}

/** 单个关键词：search 发现频道 ID */
async function searchChannelIds(keyword: string): Promise<string[]> {
  const publishedAfter = new Date(Date.now() - SEARCH_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
  const json = await ytApiGet('search', {
    part: 'snippet',
    type: 'video',
    q: keyword,
    maxResults: String(SEARCH_MAX_RESULTS),
    publishedAfter,
  })
  const items = (json.items as Record<string, unknown>[] | undefined) ?? []
  const ids = new Set<string>()
  for (const item of items) {
    const sn = item.snippet as Record<string, unknown> | undefined
    const cid = String(sn?.channelId ?? '')
    if (cid.startsWith('UC')) ids.add(cid)
  }
  return Array.from(ids)
}

interface ChannelDetail {
  channelId: string
  title: string
  thumbnail: string
  customUrl: string
  country: string
  publishedAt: string
  subscriberCount: number
  videoCount: number
  viewCount: number
}

/** channels.list 批量拉详情（每次最多 50 个 ID，1 单位） */
async function fetchChannelDetails(channelIds: string[]): Promise<ChannelDetail[]> {
  const details: ChannelDetail[] = []
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50)
    const json = await ytApiGet('channels', {
      part: 'snippet,statistics',
      id: batch.join(','),
      maxResults: '50',
    })
    const items = (json.items as Record<string, unknown>[] | undefined) ?? []
    for (const item of items) {
      const sn = (item.snippet ?? {}) as Record<string, unknown>
      const st = (item.statistics ?? {}) as Record<string, unknown>
      const thumbs = (sn.thumbnails ?? {}) as Record<string, { url?: string }>
      details.push({
        channelId: String(item.id ?? ''),
        title: String(sn.title ?? ''),
        thumbnail: String(thumbs.medium?.url ?? thumbs.default?.url ?? ''),
        customUrl: String(sn.customUrl ?? ''),
        country: String(sn.country ?? ''),
        publishedAt: String(sn.publishedAt ?? ''),
        subscriberCount: Number(st.subscriberCount ?? 0),
        videoCount: Number(st.videoCount ?? 0),
        viewCount: Number(st.viewCount ?? 0),
      })
    }
  }
  return details
}

/**
 * 跑一轮扫描（异步后台执行，进度经 onProgress 推送）。
 * 返回 runId；已在扫描中或没有可扫关键词时抛错。
 */
export function startScan(onProgress: (p: RadarScanProgress) => void): string {
  if (scanning) throw new Error('扫描正在进行中')
  if (!hasYoutubeApiKey()) throw new Error('未配置 YouTube Data API Key，请到「设置 → AI 与数据源」填写')
  const keywords = listRadarKeywords().filter((k) => k.enabled)
  if (keywords.length === 0) throw new Error('没有启用的关键词，请先添加')
  if (!canSpend('search')) {
    throw new Error(`今日配额余量不足（已用 ${getUsedToday()} 单位），已为订阅检查保留保底额度`)
  }

  const runId = `scan-${Date.now()}`
  insertRadarScanRun(runId)
  scanning = true
  stopRequested = false

  // fire-and-forget：进度经事件推送，完成态落库
  void (async () => {
    const quotaStart = getUsedToday()
    let keywordsScanned = 0
    let channelsFound = 0
    let newChannels = 0

    const progress = (stage: RadarScanProgress['stage'], currentKeyword: string, message?: string) => {
      onProgress({
        runId,
        stage,
        currentKeyword,
        keywordIndex: keywordsScanned,
        keywordTotal: keywords.length,
        channelsFound,
        newChannels,
        quotaSpent: getUsedToday() - quotaStart,
        message,
      })
    }

    let finalStage: RadarScanProgress['stage'] = 'done'
    let finalMessage: string | undefined

    try {
      for (const kw of keywords) {
        if (stopRequested) {
          finalStage = 'stopped'
          finalMessage = '已手动停止，已扫结果保留'
          break
        }
        // 每个 search（100 单位）前检查余量，给订阅检查留保底
        if (!canSpend('search')) {
          finalStage = 'stopped'
          finalMessage = `配额余量不足，本轮在第 ${keywordsScanned}/${keywords.length} 个关键词后收口（已用 ${getUsedToday()} 单位）`
          break
        }

        progress('scanning', kw.keyword)
        logInfo(`[radar] scanning keyword "${kw.keyword}" (${keywordsScanned + 1}/${keywords.length})`)

        const channelIds = await searchChannelIds(kw.keyword)
        const details = await fetchChannelDetails(channelIds)
        for (const d of details) {
          if (!d.channelId) continue
          const isNew = upsertRadarChannel({ ...d, sourceKeyword: kw.keyword })
          insertRadarSnapshot(d.channelId, d.subscriberCount, d.viewCount, d.videoCount)
          channelsFound += 1
          if (isNew) newChannels += 1
        }

        touchRadarKeywordScanned(kw.id)
        keywordsScanned += 1
        progress('scanning', kw.keyword)
      }
    } catch (err) {
      finalStage = 'failed'
      finalMessage = err instanceof Error ? err.message : String(err)
      logError('[radar] scan failed', err)
    } finally {
      scanning = false
      stopRequested = false
      const quotaSpent = getUsedToday() - quotaStart
      updateRadarScanRun(runId, {
        finishedAt: Date.now(),
        keywordsScanned,
        channelsFound,
        newChannels,
        quotaSpent,
        status: finalStage,
        errorMessage: finalMessage ?? '',
      })
      logInfo(`[radar] scan ${finalStage}: keywords=${keywordsScanned}/${keywords.length} channels=${channelsFound} new=${newChannels} quota=${quotaSpent}`)
      progress(finalStage, '', finalMessage)
    }
  })()

  return runId
}

/** 预估一轮全量扫描的配额消耗（search 100/词 + channels 约 1/词） */
export function estimateScanCost(): number {
  const enabled = listRadarKeywords().filter((k) => k.enabled).length
  return enabled * (endpointCost('search') + 1)
}
