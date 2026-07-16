import { create } from 'zustand'
import type { PageKey } from '../pages'

// ────────── 导航 store：当前页面 + 跨页跳转信号 ──────────
// retryUrl：下载列表「重新下载」→ 视频下载页（VideoDownload 切 tab、SingleDownload 填 URL 后 clear）

interface NavStore {
  currentPage: PageKey
  setPage: (page: PageKey) => void

  retryUrl: string | null
  /** 带重试 URL 跳到单视频下载页 */
  gotoRetry: (url: string) => void
  clearRetryUrl: () => void
}

export const useNavStore = create<NavStore>((set) => ({
  currentPage: 'video-download',
  setPage: (page) => set({ currentPage: page }),

  retryUrl: null,
  gotoRetry: (url) => set({ currentPage: 'video-download', retryUrl: url }),
  clearRetryUrl: () => set({ retryUrl: null }),
}))
