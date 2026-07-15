import type { AppSettings } from '../../shared/types'
import { logInfo } from './logger'

// ────────── 设置中枢 ──────────
// 渲染端 localStorage 是设置唯一真源；每次启动 / 变更时经 settings:sync 全量推送到这里，
// 由本模块分发给各 service 的运行时缓存 setter（订阅方在 ipc/settings.ts 集中注册）。

let current: AppSettings | null = null
const listeners: Array<(s: AppSettings) => void> = []

/** 应用一份全量设置并通知所有订阅方 */
export function applySettings(s: AppSettings): void {
  current = s
  logInfo('[settings] applied full settings from renderer')
  for (const l of listeners) l(s)
}

/** 订阅设置变更；若已有设置立即回放一次 */
export function onSettings(listener: (s: AppSettings) => void): void {
  listeners.push(listener)
  if (current) listener(current)
}

/** 当前设置快照（收到首次 settings:sync 前为 null） */
export function getSettings(): AppSettings | null {
  return current
}
