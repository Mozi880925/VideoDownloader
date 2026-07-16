import type { SubtitleOptions } from '../../shared/types'
import { friendlyError } from '../../shared/errorTranslator'
import { useActiveTasksStore } from '../store/activeTasksStore'
import { useHistoryStore } from '../store/historyStore'
import { useSettingsStore } from '../store/settingsStore'
import { detectPlatform } from './platform'
import { buildOutputPath } from './buildOutputPath'

// ────────── 下载启动公共核心（SingleDownload / BatchDownload worker 共用）──────────
// 统一：addTask 入全局 store → downloadVideo → 按 status 分支
// completeTask/cancelTask/failTask + 系统通知 + cookie_error 特判 + friendlyError。
// 纯函数（非 hook）：批量下载的 worker 循环里也能直接调用。

export type DownloadOutcome =
  | { kind: 'success'; filepath?: string; instantSkip: boolean }
  | { kind: 'cancelled' }
  | { kind: 'cookie_error'; message: string }
  | { kind: 'failed'; message: string }   // message 已经过 friendlyError 翻译

export interface RunDownloadOptions {
  taskId: string
  url: string
  title?: string
  thumbnail?: string
  outputPath: string
  formatId?: string
  subtitles?: SubtitleOptions
  section?: { start: number; end: number; title: string }
  audioOnly?: boolean
  /** 系统通知标题（单视频「下载完成」/ 批量「批量下载 - 任务完成」） */
  notifyTitle?: string
  /** 系统通知正文兜底文案 */
  notifyFallbackBody?: string
}

/** 解析下载根目录 + 按命名规则/归档方式生成输出模板 */
export async function resolveOutputPath(
  videoUrl: string,
  cachedBaseDir?: string,
): Promise<{ baseDir: string; outputPath: string }> {
  const s = useSettingsStore.getState().appSettings
  const baseDir = s.downloadPath || cachedBaseDir || (await window.api.getDownloadsPath().catch(() => ''))
  return {
    baseDir,
    outputPath: buildOutputPath(videoUrl, baseDir, s.namingRule || '', s.folderOrganize ?? 'none'),
  }
}

/** 磁盘空间预估检查（非阻塞）；空间可能不足时返回 MB 文案，充足或检查失败返回 null */
export async function checkDiskSpace(
  baseDir: string,
  estimatedBytes: number,
): Promise<{ estimatedMB: string; availableMB: string } | null> {
  try {
    if (!baseDir || estimatedBytes <= 0) return null
    const disk = await window.api.getDiskSpace(baseDir)
    if (disk.available > 0 && estimatedBytes > disk.available) {
      const toMB = (b: number) => (b / 1024 / 1024).toFixed(0)
      return { estimatedMB: toMB(estimatedBytes), availableMB: toMB(disk.available) }
    }
  } catch { /* 忽略磁盘检查失败 */ }
  return null
}

export async function runDownload(opts: RunDownloadOptions): Promise<DownloadOutcome> {
  const { taskId, url } = opts

  // 加入进行中任务 store（下载列表页展示）
  useActiveTasksStore.getState().addTask({
    taskId,
    url,
    title: opts.title || '未知标题',
    thumbnail: opts.thumbnail || '',
    platform: detectPlatform(url),
  })

  const result = await window.api.downloadVideo({
    url,
    formatId: opts.formatId,
    outputPath: opts.outputPath,
    taskId,
    subtitles: opts.subtitles,
    section: opts.section,
    audioOnly: opts.audioOnly,
  })

  const active = useActiveTasksStore.getState()
  const task = active.activeTasks.find((t) => t.taskId === taskId)

  if (result.status === 'success') {
    // 未收到过进度即完成 = 本地已有文件的极速秒传
    const instantSkip = task ? !task.hasReceivedProgress : false
    if (task) {
      active.removeTask(taskId)
      useHistoryStore.getState().addCompleted(task, result.data || '')
    }
    const s = useSettingsStore.getState().appSettings
    if (s.enableNotification) {
      window.api
        .showNotification(opts.notifyTitle ?? '下载完成', opts.title || opts.notifyFallbackBody || '视频下载成功')
        .catch(() => {})
    }
    return { kind: 'success', filepath: result.data, instantSkip }
  }

  if (result.status === 'cancelled') {
    active.removeTask(taskId)
    return { kind: 'cancelled' }
  }

  // failed / timeout / cookie_error → 失败记录（historyStore 内部做 friendlyError）
  if (task) {
    active.removeTask(taskId)
    useHistoryStore.getState().addFailed(task, result.errorMessage || '')
  }

  if (result.status === 'cookie_error') {
    // cookie_error 保留原始信息不经 friendlyError 翻译
    return { kind: 'cookie_error', message: result.errorMessage || 'Cookie读取失败，请确认 Chrome 已安装且未锁定' }
  }

  return { kind: 'failed', message: friendlyError(result.errorMessage || '') }
}
