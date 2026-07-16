import type { VideoInfo } from '../../shared/types'
import { friendlyError } from '../../shared/errorTranslator'

// ────────── 视频解析公共核心（SingleDownload / BatchDownload 共用）──────────
// 统一 TaskResult → 判定结果的分类逻辑（含 cookie_error 不经 friendlyError 的特判），
// 页面只负责各自的 UI 状态更新。

export type ParseOutcome =
  | { kind: 'success'; info: VideoInfo }
  | { kind: 'cancelled' }
  | { kind: 'cookie_error'; message: string }
  | { kind: 'failed'; message: string }   // message 已经过 friendlyError 翻译

export async function runParse(url: string, taskId?: string): Promise<ParseOutcome> {
  const result = await window.api.parseVideo(url, undefined, taskId)
  if (result.status === 'success' && result.data) {
    return { kind: 'success', info: result.data }
  }
  if (result.status === 'cancelled') {
    return { kind: 'cancelled' }
  }
  if (result.status === 'cookie_error') {
    return { kind: 'cookie_error', message: result.errorMessage || 'Cookie读取失败，请确认 Chrome 已安装且未锁定' }
  }
  return { kind: 'failed', message: friendlyError(result.errorMessage || '') }
}
