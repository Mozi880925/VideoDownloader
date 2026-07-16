import { create } from 'zustand'
import { friendlyError } from '../../shared/errorTranslator'
import type { CompletedRecord, FailedRecord } from '../../shared/types'
import type { ActiveTask } from './activeTasksStore'

// ────────── 下载历史（已完成 / 失败记录，DB 持久化 + 乐观更新）──────────

interface HistoryStore {
  completedRecords: CompletedRecord[]
  failedRecords: FailedRecord[]
  dbLoaded: boolean

  loadFromDb: () => Promise<void>
  /** 任务成功 → 生成完成记录（乐观更新，DB 写入失败回滚） */
  addCompleted: (task: ActiveTask, filepath: string) => void
  /** 任务失败 → 生成失败记录（内部做 friendlyError 翻译） */
  addFailed: (task: ActiveTask, rawErrorMessage: string) => void
  removeRecord: (taskId: string) => void
  removeFailedRecord: (taskId: string) => void
  clearAllCompleted: () => void
  clearAllFailed: () => void
  updateRecordTags: (taskId: string, tags: string[]) => void
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  completedRecords: [],
  failedRecords: [],
  dbLoaded: false,

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

  addCompleted: (task, filepath) => {
    const record: CompletedRecord = {
      taskId: task.taskId,
      url: task.url,
      title: task.title,
      thumbnail: task.thumbnail,
      platform: task.platform,
      filepath,
      completedAt: Date.now(),
      tags: [],
    }
    // 乐观更新 state
    set((s) => ({ completedRecords: [record, ...s.completedRecords] }))
    // 持久化到 DB；失败时回滚
    window.api.dbInsertCompletedRecord(record).catch((err: unknown) => {
      console.error('[store] db insert completed failed, rolling back:', err)
      set((s) => ({
        completedRecords: s.completedRecords.filter((r) => r.taskId !== task.taskId),
      }))
    })
  },

  addFailed: (task, rawErrorMessage) => {
    const record: FailedRecord = {
      taskId: task.taskId,
      url: task.url,
      title: task.title,
      thumbnail: task.thumbnail,
      platform: task.platform,
      errorMessage: friendlyError(rawErrorMessage),
      failedAt: Date.now(),
    }
    window.api.dbInsertFailedRecord(record)
      .catch((err: unknown) => console.error('[store] db insert failed record failed:', err))
    set((s) => ({ failedRecords: [record, ...s.failedRecords] }))
  },

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
}))
