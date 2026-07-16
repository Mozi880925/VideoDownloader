/**
 * localStorage 统一封装：JSON 安全解析 + 写入失败静默。
 * key 约定：新增 key 一律用 'vd:' 前缀；历史 key（vdownload_settings 等）保持原名不迁移。
 */

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 配额满 / 隐私模式等场景静默失败
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}
