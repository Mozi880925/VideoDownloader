/**
 * 共享格式化工具函数
 */

/**
 * 将秒数格式化为 mm:ss 或 hh:mm:ss
 * @param empty 空值/非法值时的占位文案（各页面历史展示不同：'-' / '--' / ''）
 */
export function formatDuration(seconds?: number | null, empty = '-'): string {
  if (!seconds || seconds <= 0) return empty
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * YYYYMMDD → YYYY-MM-DD；非 8 位数字原样返回（undefined 返回空串）
 */
export function formatUploadDate(yyyymmdd?: string): string {
  if (!yyyymmdd) return ''
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

/**
 * 将文件大小字节数格式化为人类可读字符串
 */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * 将时间戳格式化为简短日期时间（月/日 时:分）
 */
export function formatShortDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
