import { handle, sendToAll } from './typed'
import { startDistill, retryDistill, cancelDistill } from '../services/distill'
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
}
