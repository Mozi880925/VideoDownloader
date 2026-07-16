import { handle, sendToAll } from './typed'
import { startScan, requestStopScan } from '../services/radar'
import {
  listRadarKeywords,
  insertRadarKeyword,
  deleteRadarKeyword,
  setRadarKeywordEnabled,
  listRadarChannels,
  deleteRadarChannel,
  listRadarScanRuns,
} from '../services/db'
import type { RadarKeyword } from '../../shared/types'

export function registerRadarHandlers(): void {
  // ---- 关键词管理 ----
  handle('radar:list-keywords', () => {
    try {
      return listRadarKeywords()
    } catch (err) {
      console.error('[radar] list keywords failed:', err)
      return []
    }
  })

  handle('radar:add-keywords', (_e, keywords) => {
    const added: RadarKeyword[] = []
    for (const raw of keywords) {
      const keyword = raw.trim()
      if (!keyword) continue
      const kw = insertRadarKeyword(`kw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, keyword)
      if (kw) added.push(kw)
    }
    return added
  })

  handle('radar:remove-keyword', (_e, id) => {
    deleteRadarKeyword(id)
  })

  handle('radar:toggle-keyword', (_e, id, enabled) => {
    setRadarKeywordEnabled(id, enabled)
  })

  // ---- 扫描 ----
  handle('radar:start-scan', () => {
    try {
      const runId = startScan((p) => sendToAll('event:radar-scan-progress', p))
      return { status: 'success' as const, data: { runId } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  handle('radar:stop-scan', () => {
    requestStopScan()
  })

  // ---- 频道库 ----
  handle('radar:list-channels', (_e, opts) => {
    try {
      return listRadarChannels(opts)
    } catch (err) {
      console.error('[radar] list channels failed:', err)
      return []
    }
  })

  handle('radar:remove-channel', (_e, channelId) => {
    deleteRadarChannel(channelId)
  })

  // ---- 扫描记录 ----
  handle('radar:list-runs', (_e, limit) => {
    try {
      return listRadarScanRuns(limit ?? 20)
    } catch (err) {
      console.error('[radar] list runs failed:', err)
      return []
    }
  })
}
