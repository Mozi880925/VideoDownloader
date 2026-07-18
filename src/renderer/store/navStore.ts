import { create } from 'zustand'
import type { PageKey } from '../pages'

// ────────── 导航 store：当前页面 + 跨页跳转信号 ──────────
// retryUrl：下载列表「重新下载」→ 视频下载页（VideoDownload 切 tab、SingleDownload 填 URL 后 clear）
// hubTab：AI 提纯发起后 → 字幕和转录页并定位到指定 Tab（TranscriptHub 消费后 clear）

export type TranscriptHubTab = 'transcribe' | 'extract' | 'library'

interface NavStore {
  currentPage: PageKey
  setPage: (page: PageKey) => void

  retryUrl: string | null
  /** 带重试 URL 跳到单视频下载页 */
  gotoRetry: (url: string) => void
  clearRetryUrl: () => void

  hubTab: TranscriptHubTab | null
  /** 跳到「字幕和转录」页并定位到指定 Tab */
  gotoTranscriptHub: (tab: TranscriptHubTab) => void
  clearHubTab: () => void
}

export const useNavStore = create<NavStore>((set) => ({
  currentPage: 'radar',
  setPage: (page) => set({ currentPage: page }),

  retryUrl: null,
  gotoRetry: (url) => set({ currentPage: 'video-download', retryUrl: url }),
  clearRetryUrl: () => set({ retryUrl: null }),

  hubTab: null,
  gotoTranscriptHub: (tab) => set({ currentPage: 'transcript-hub', hubTab: tab }),
  clearHubTab: () => set({ hubTab: null }),
}))
