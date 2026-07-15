import { Notification } from 'electron'
import { handle, sendTo, sendToAll } from './typed'
import {
  addSubscription,
  listSubscriptions,
  removeSubscription,
  toggleSubscription,
  setSubscriptionGroup,
  setSubscriptionPinned,
  checkSubscription,
  checkAllSubscriptions,
  listNewVideos,
  dismissNewVideo,
  clearNewVideos,
  startScheduler,
} from '../services/subscription'
import { setAutoAnalysisNotifier } from '../services/autoAnalysis'
import type { NewVideoItem } from '../../shared/types'

/** 新视频桌面通知（单订阅 / 全量 / 定时三处共用） */
function notifyNewVideos(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

export function registerSubscriptionHandlers(): void {
  // 爆款自动拆解完成 → 推送渲染端刷新角标
  setAutoAnalysisNotifier((info) => {
    sendToAll('event:analysis-auto-done', info)
  })

  handle('sub:list', () => {
    try {
      return listSubscriptions()
    } catch (err) {
      console.error('[sub] list failed:', err)
      return []
    }
  })

  handle('sub:add', async (_event, url, customName) => {
    try {
      const sub = await addSubscription(url, customName)
      return { status: 'success' as const, data: sub }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  handle('sub:remove', (_event, id) => {
    try {
      removeSubscription(id)
    } catch (err) {
      console.error('[sub] remove failed:', err)
    }
  })

  handle('sub:toggle', (_event, id, enabled) => {
    try {
      toggleSubscription(id, enabled)
    } catch (err) {
      console.error('[sub] toggle failed:', err)
    }
  })

  handle('sub:set-group', (_event, id, groupName) => {
    try {
      setSubscriptionGroup(id, groupName)
    } catch (err) {
      console.error('[sub] set-group failed:', err)
    }
  })

  handle('sub:set-pinned', (_event, id, pinned) => {
    try {
      setSubscriptionPinned(id, pinned)
    } catch (err) {
      console.error('[sub] set-pinned failed:', err)
    }
  })

  handle('sub:check', async (_event, id) => {
    try {
      const newVideos = await checkSubscription(id)
      if (newVideos.length > 0) {
        const sub = listSubscriptions().find((s) => s.id === id)
        notifyNewVideos(
          `${sub?.name ?? '订阅'} 有 ${newVideos.length} 个新视频`,
          newVideos.slice(0, 3).map((v) => v.title).join('  ·  '),
        )
      }
      return { status: 'success' as const, data: newVideos }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  handle('sub:check-all', async () => {
    const allNew: { subId: string; subName: string; newVideos: NewVideoItem[]; err?: string }[] = []
    await checkAllSubscriptions((subId, subName, newVideos, err) => {
      allNew.push({ subId, subName, newVideos, err: err?.message })
    })
    const totalNew = allNew.reduce((sum, x) => sum + x.newVideos.length, 0)
    if (totalNew > 0) {
      notifyNewVideos(
        `订阅检查完成：${totalNew} 个新视频`,
        allNew.filter((x) => x.newVideos.length > 0).slice(0, 3)
          .map((x) => `${x.subName}：${x.newVideos.length} 个`).join('  ·  '),
      )
    }
    return allNew
  })

  handle('sub:new-videos', (_event, channelId) => {
    try {
      return listNewVideos(channelId)
    } catch (err) {
      console.error('[sub] list new videos failed:', err)
      return []
    }
  })

  handle('sub:dismiss', (_event, videoId, channelId) => {
    try {
      dismissNewVideo(videoId, channelId)
    } catch (err) {
      console.error('[sub] dismiss failed:', err)
    }
  })

  handle('sub:clear-new', (_event, channelId) => {
    try {
      return clearNewVideos(channelId)
    } catch (err) {
      console.error('[sub] clear new failed:', err)
      return 0
    }
  })

  handle('sub:set-interval', (event, interval) => {
    startScheduler(interval, (results) => {
      const totalNew = results.reduce((sum, r) => sum + r.newVideos.length, 0)
      if (totalNew > 0) {
        notifyNewVideos(
          `定时检查：发现 ${totalNew} 个新视频`,
          results.filter((r) => r.newVideos.length > 0).slice(0, 3)
            .map((r) => `${r.subName}：${r.newVideos.length} 个`).join('  ·  '),
        )
      }
      sendTo(event.sender, 'event:sub-scheduler-tick', { totalNew })
    })
  })
}
