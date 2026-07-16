import { create } from 'zustand'
import { friendlyError } from '../../shared/errorTranslator'
import type { CompletedRecord, FailedRecord } from '../../shared/types'
import { useNavStore } from './navStore'

// ---- 从 utils 重导出，保持向后兼容 ----

export { detectPlatform, PLATFORM_OPTIONS } from '../utils/platform'

// ---- 批量下载任务类型（在 store 中定义以便跨组件共享）----

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

// ---- 类型 ----

export interface ActiveTask {
  taskId: string
  url: string
  title: string
  thumbnail: string
  platform: string
  progress: number
  speed: string
  eta: string
  filesize: string
  status: 'preparing' | 'downloading' | 'merging'
  hasReceivedProgress: boolean
  startedAt: number
}

// domain 类型已上移到 shared/types.ts（主进程 db 层直接返回 domain 形状），此处重导出兼容既有引用
export type { CompletedRecord, FailedRecord } from '../../shared/types'

interface TaskStore {
  activeTasks: ActiveTask[]
  completedRecords: CompletedRecord[]
  failedRecords: FailedRecord[]
  dbLoaded: boolean
  pendingBatchUrls: string[]

  // 筛选状态
  filterKeyword: string
  filterPlatform: string | null  // null = 全部平台
  filterDateRange: [number, number] | null  // null = 全部时间，[startTs, endTs]（毫秒）

  commitBatchUrls: (urls: string[]) => void
  consumeBatchUrls: () => string[]

  // 批量下载任务状态（跨页面持久）
  batchTasks: BatchTask[]
  batchIsParsing: boolean
  batchIsDownloading: boolean
  setBatchTasks: (tasks: BatchTask[] | ((prev: BatchTask[]) => BatchTask[])) => void
  setBatchIsParsing: (v: boolean) => void
  setBatchIsDownloading: (v: boolean) => void

  loadFromDb: () => Promise<void>
  addTask: (task: Omit<ActiveTask, 'progress' | 'speed' | 'eta' | 'filesize' | 'status' | 'hasReceivedProgress' | 'startedAt'>) => void
  updateProgress: (taskId: string, progress: number, speed: string, eta: string, filesize: string) => void
  setTaskStatus: (taskId: string, status: ActiveTask['status']) => void
  completeTask: (taskId: string, filepath: string) => void
  failTask: (taskId: string, errorMessage: string) => void
  cancelTask: (taskId: string) => void
  removeRecord: (taskId: string) => void
  removeFailedRecord: (taskId: string) => void
  clearAllCompleted: () => void
  clearAllFailed: () => void
  updateRecordTags: (taskId: string, tags: string[]) => void
  setFilterKeyword: (keyword: string) => void
  setFilterPlatform: (platform: string | null) => void
  setFilterDateRange: (range: [number, number] | null) => void
}

// ---- Store ----

export const useDownloadStore = create<TaskStore>((set, get) => ({
  activeTasks: [],
  completedRecords: [],
  failedRecords: [],
  dbLoaded: false,
  pendingBatchUrls: [],

  filterKeyword: '',
  filterPlatform: null,
  filterDateRange: null,

  commitBatchUrls: (urls) => {
    set({ pendingBatchUrls: urls })
    // 提交批量 URL 的同时切到批量下载页（原先由 App 监听 pendingBatchUrls 切页）
    useNavStore.getState().setPage('batch-download')
  },

  consumeBatchUrls: () => {
    const urls = get().pendingBatchUrls
    if (urls.length > 0) {
      set({ pendingBatchUrls: [] })
    }
    return urls
  },

  batchTasks: [],
  batchIsParsing: false,
  batchIsDownloading: false,
  setBatchTasks: (tasks) => set((state) => ({
    batchTasks: typeof tasks === 'function' ? tasks(state.batchTasks) : tasks,
  })),
  setBatchIsParsing: (v) => set({ batchIsParsing: v }),
  setBatchIsDownloading: (v) => set({ batchIsDownloading: v }),

  loadFromDb: async () => {
    try {
      // 主进程 db 层直接返回 domain 类型，无需再做行映射
      const [completedRecords, failedRecords] = await Promise.all([
        window.api.dbGetCompletedRecords(),
        window.api.dbGetFailedRecords(),
      ])
      set({ completedRecords, failedRecords, dbLoaded: true })
      console.log('[store] loaded', completedRecords.length, 'completed +', failedRecords.length, 'failed records from db')
    } catch (err) {
      console.error('[store] failed to load from db:', err)
      set({ dbLoaded: true })
    }
  },

  addTask: (task) =>
    set((state) => ({
      activeTasks: [
        {
          ...task,
          progress: 0,
          speed: '',
          eta: '',
          filesize: '',
          status: 'preparing' as const,
          hasReceivedProgress: false,
          startedAt: Date.now(),
        },
        ...state.activeTasks,
      ],
    })),

  updateProgress: (taskId, progress, speed, eta, filesize) =>
    set((state) => ({
      activeTasks: state.activeTasks.map((t) =>
        t.taskId === taskId
          ? { ...t, progress, speed, eta, filesize, status: 'downloading' as const, hasReceivedProgress: true }
          : t,
      ),
    })),

  setTaskStatus: (taskId, status) =>
    set((state) => ({
      activeTasks: state.activeTasks.map((t) =>
        t.taskId === taskId ? { ...t, status } : t,
      ),
    })),

  completeTask: (taskId, filepath) => {
    const task = get().activeTasks.find((t) => t.taskId === taskId)
    if (!task) return
    const completedAt = Date.now()
    const record = {
      taskId: task.taskId,
      url: task.url,
      title: task.title,
      thumbnail: task.thumbnail,
      platform: task.platform,
      filepath,
      completedAt,
      tags: [] as string[],
    }
    // 乐观更新 state
    set((s) => ({
      activeTasks: s.activeTasks.filter((t) => t.taskId !== taskId),
      completedRecords: [record, ...s.completedRecords],
    }))
    // 持久化到 DB；失败时回滚
    window.api.dbInsertCompletedRecord(record).catch((err: unknown) => {
      console.error('[store] db insert completed failed, rolling back:', err)
      set((s) => ({
        completedRecords: s.completedRecords.filter((r) => r.taskId !== taskId),
      }))
    })
  },

  failTask: (taskId, rawErrorMessage) =>
    set((state) => {
      const task = state.activeTasks.find((t) => t.taskId === taskId)
      if (!task) return state
      const failedAt = Date.now()
      
      const errorMessage = friendlyError(rawErrorMessage)
      const record: FailedRecord = {
        taskId: task.taskId,
        url: task.url,
        title: task.title,
        thumbnail: task.thumbnail,
        platform: task.platform,
        errorMessage,
        failedAt,
      }

      // 持久化到数据库
      window.api.dbInsertFailedRecord(record)
        .catch((err: unknown) => console.error('[store] db insert failed record failed:', err))

      return {
        activeTasks: state.activeTasks.filter((t) => t.taskId !== taskId),
        failedRecords: [record, ...state.failedRecords],
      }
    }),

  cancelTask: (taskId) =>
    set((state) => ({
      activeTasks: state.activeTasks.filter((t) => t.taskId !== taskId),
    })),

  removeRecord: (taskId) => {
    window.api.dbDeleteCompletedRecord(taskId)
      .catch((err: unknown) => console.error('[store] db delete completed failed:', err))
    set((state) => ({
      completedRecords: state.completedRecords.filter((r) => r.taskId !== taskId),
    }))
  },

  removeFailedRecord: (taskId) => {
    window.api.dbDeleteFailedRecord(taskId)
      .catch((err: unknown) => console.error('[store] db delete failed record failed:', err))
    set((state) => ({
      failedRecords: state.failedRecords.filter((r) => r.taskId !== taskId),
    }))
  },

  clearAllCompleted: () => {
    window.api.dbClearAllCompleted()
      .catch((err: unknown) => console.error('[store] db clear all completed failed:', err))
    set({ completedRecords: [] })
  },

  clearAllFailed: () => {
    window.api.dbClearAllFailed()
      .catch((err: unknown) => console.error('[store] db clear all failed failed:', err))
    set({ failedRecords: [] })
  },

  updateRecordTags: (taskId, tags) => {
    const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)))
    window.api.dbUpdateCompletedRecordTags(taskId, cleaned)
      .catch((err: unknown) => console.error('[store] db update tags failed:', err))
    set((state) => ({
      completedRecords: state.completedRecords.map((r) =>
        r.taskId === taskId ? { ...r, tags: cleaned } : r,
      ),
    }))
  },

  setFilterKeyword: (keyword) => set({ filterKeyword: keyword }),
  setFilterPlatform: (platform) => set({ filterPlatform: platform }),
  setFilterDateRange: (range) => set({ filterDateRange: range }),
}))
