import { create } from 'zustand'

// ---- 筛选状态（本页私有，不进全局 store）----

interface FilterState {
  filterKeyword: string
  filterPlatform: string | null            // null = 全部平台
  filterDateRange: [number, number] | null // null = 全部时间，[startTs, endTs]（毫秒）
  setFilterKeyword: (keyword: string) => void
  setFilterPlatform: (platform: string | null) => void
  setFilterDateRange: (range: [number, number] | null) => void
}

export const useFilterStore = create<FilterState>((set) => ({
  filterKeyword: '',
  filterPlatform: null,
  filterDateRange: null,
  setFilterKeyword: (filterKeyword) => set({ filterKeyword }),
  setFilterPlatform: (filterPlatform) => set({ filterPlatform }),
  setFilterDateRange: (filterDateRange) => set({ filterDateRange }),
}))

// ---- 筛选逻辑 ----

export function matchesFilter(
  item: { title: string; platform: string; tags?: string[]; ts?: number },
  keyword: string,
  platform: string | null,
  dateRange: [number, number] | null,
): boolean {
  if (platform && item.platform !== platform) return false
  if (keyword) {
    const kw = keyword.toLowerCase()
    const titleHit = item.title.toLowerCase().includes(kw)
    const tagHit = (item.tags ?? []).some((t) => t.toLowerCase().includes(kw))
    if (!titleHit && !tagHit) return false
  }
  if (dateRange && item.ts != null) {
    if (item.ts < dateRange[0] || item.ts > dateRange[1]) return false
  }
  return true
}
