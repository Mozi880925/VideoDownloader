import { create } from 'zustand'
import { useNavStore } from './navStore'

// ────────── 批量下载（任务列表跨页持久 + 跨页 URL 缓冲）──────────

export type ParseStatus = 'waiting' | 'parsing' | 'parsed' | 'parse_failed'
export type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'downloaded' | 'download_failed' | 'cancelled'

export interface BatchTask {
  id: string
  url: string
  parseStatus: ParseStatus
  downloadStatus: DownloadStatus
  title?: string
  thumbnail?: string
  author?: string
  duration?: number
  formatCount?: number
  parseError?: string
  downloadTaskId?: string
  progress?: number
  speed?: string
  eta?: string
  filepath?: string
  downloadError?: string
  filesize?: number
}

interface BatchStore {
  batchTasks: BatchTask[]
  batchIsParsing: boolean
  batchIsDownloading: boolean
  setBatchTasks: (tasks: BatchTask[] | ((prev: BatchTask[]) => BatchTask[])) => void
  setBatchIsParsing: (v: boolean) => void
  setBatchIsDownloading: (v: boolean) => void

  /** 其他页面（下载列表/订阅/搜索等）向批量下载页投递 URL 的跨页缓冲 */
  pendingBatchUrls: string[]
  commitBatchUrls: (urls: string[]) => void
  consumeBatchUrls: () => string[]
}

export const useBatchStore = create<BatchStore>((set, get) => ({
  batchTasks: [],
  batchIsParsing: false,
  batchIsDownloading: false,

  setBatchTasks: (tasks) => set((state) => ({
    batchTasks: typeof tasks === 'function' ? tasks(state.batchTasks) : tasks,
  })),
  setBatchIsParsing: (v) => set({ batchIsParsing: v }),
  setBatchIsDownloading: (v) => set({ batchIsDownloading: v }),

  pendingBatchUrls: [],

  commitBatchUrls: (urls) => {
    set({ pendingBatchUrls: urls })
    // 提交批量 URL 的同时切到批量下载页
    useNavStore.getState().setPage('batch-download')
  },

  consumeBatchUrls: () => {
    const urls = get().pendingBatchUrls
    if (urls.length > 0) {
      set({ pendingBatchUrls: [] })
    }
    return urls
  },
}))
