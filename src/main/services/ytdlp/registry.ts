import type { spawn } from 'child_process'
import { killProcessTree } from '../processUtils'

// ────────── 活跃子进程登记（parse / download 共用；只被依赖，不依赖兄弟模块）──────────

export const activeDownloads = new Map<string, ReturnType<typeof spawn>>()
export const activeParses = new Map<string, ReturnType<typeof spawn>>()
export const cancelledTasks = new Set<string>()

/**
 * 取消正在进行的解析
 */
export function cancelParse(taskId: string): boolean {
  cancelledTasks.add(taskId)
  const proc = activeParses.get(taskId)
  if (!proc) return false
  killProcessTree(proc)
  activeParses.delete(taskId)
  return true
}

/**
 * 取消指定任务的下载
 */
export function cancelDownload(taskId: string): boolean {
  // 无论进程是否存在都先标记 cancelled，防止重试等待窗口期（activeDownloads 无条目）
  // 时调用 cancel 不生效，导致 attemptDownload 下次重试仍然启动新进程
  cancelledTasks.add(taskId)
  const proc = activeDownloads.get(taskId)
  if (!proc) return false
  killProcessTree(proc)
  activeDownloads.delete(taskId)
  return true
}

/**
 * 应用退出时清理所有活跃的子进程
 */
export function killAllActive(): void {
  for (const [taskId, proc] of activeDownloads) {
    console.log('[ytdlp] killing active download on quit:', taskId)
    killProcessTree(proc)
  }
  activeDownloads.clear()

  for (const [taskId, proc] of activeParses) {
    console.log('[ytdlp] killing active parse on quit:', taskId)
    killProcessTree(proc)
  }
  activeParses.clear()
}
