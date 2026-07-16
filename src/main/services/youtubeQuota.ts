import { addQuotaUsage, setQuotaUsage, getQuotaUsage } from './db'
import { logError } from './logger'

// ────────── YouTube Data API 当日配额账本 ──────────
// 免费配额 10,000 单位/天，太平洋时间 0 点重置。订阅检查与后续的
// 蓝海雷达共享同一 key，此账本用于记账与余量保护：
// - youtubeApi.apiGet 每次调用自动 charge()（按 endpoint 成本）
// - 大额消费方（雷达 search，100 单位/次）调用前用 canSpend() 检查余量，
//   默认给订阅检查保留 1000 单位保底

export const DAILY_LIMIT = 10_000
/** 大额消费方默认为订阅检查保留的保底额度 */
export const DEFAULT_RESERVE = 1_000

/** endpoint → 配额成本（未列出的一律按 1 单位） */
const COST: Record<string, number> = {
  search: 100,
}

/** 太平洋时间的今天（YYYY-MM-DD，en-CA 格式天然是 ISO 日期） */
export function ptToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
}

export function endpointCost(endpoint: string): number {
  return COST[endpoint] ?? 1
}

/** 记一笔消费（youtubeApi.apiGet 自动调用；失败静默，不阻塞 API 请求） */
export function charge(endpoint: string, calls = 1): void {
  try {
    addQuotaUsage(ptToday(), endpointCost(endpoint) * calls)
  } catch (err) {
    logError('[quota] charge failed', err)
  }
}

/** 当日已用配额 */
export function getUsedToday(): number {
  try {
    return getQuotaUsage(ptToday())
  } catch {
    return 0
  }
}

/**
 * 大额消费前检查：花掉这笔后是否还能给订阅检查留出 reserve 保底。
 * （订阅检查自身不受此限制——它就是被保护的对象）
 */
export function canSpend(endpoint: string, calls = 1, reserve = DEFAULT_RESERVE): boolean {
  return DAILY_LIMIT - getUsedToday() - endpointCost(endpoint) * calls >= reserve
}

/** 收到 quotaExceeded 时把当日 used 对齐到上限（本地账本与真实状态同步） */
export function markExhausted(): void {
  try {
    setQuotaUsage(ptToday(), DAILY_LIMIT)
  } catch (err) {
    logError('[quota] markExhausted failed', err)
  }
}
