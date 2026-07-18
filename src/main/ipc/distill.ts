import { handle, sendToAll } from './typed'
import { startDistill, retryDistill, cancelDistill } from '../services/distill'
import { testFeishu, createFeishuDoc } from '../services/feishu'
import {
  listDistilledArticles,
  getDistilledArticle,
  deleteDistilledArticle,
} from '../services/db'

export function registerDistillHandlers(): void {
  handle('distill:start', (_e, input) => {
    try {
      const articleId = startDistill(input, (p) => sendToAll('event:distill-progress', p))
      return { status: 'success' as const, data: { articleId } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  handle('distill:retry', (_e, articleId) => {
    try {
      retryDistill(articleId, (p) => sendToAll('event:distill-progress', p))
      return { status: 'success' as const, data: { articleId } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  handle('distill:cancel', (_e, articleId) => cancelDistill(articleId))

  handle('distill:list', () => {
    try {
      return listDistilledArticles()
    } catch (err) {
      console.error('[distill] list failed:', err)
      return []
    }
  })

  handle('distill:get', (_e, articleId) => {
    try {
      return getDistilledArticle(articleId)
    } catch {
      return null
    }
  })

  handle('distill:delete', (_e, articleId) => {
    deleteDistilledArticle(articleId)
  })

  // ---- 飞书文档交付 ----
  handle('feishu:test', (_e, cfg) => testFeishu(cfg))

  handle('feishu:create-doc', async (_e, articleId) => {
    try {
      const url = await createFeishuDoc(articleId)
      return { status: 'success' as const, data: { url } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })
}
