import { create } from 'zustand'

// ────────── 进行中的下载任务（单视频 + 批量的全局任务卡片）──────────

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

interface ActiveTasksStore {
  activeTasks: ActiveTask[]
  addTask: (task: Omit<ActiveTask, 'progress' | 'speed' | 'eta' | 'filesize' | 'status' | 'hasReceivedProgress' | 'startedAt'>) => void
  updateProgress: (taskId: string, progress: number, speed: string, eta: string, filesize: string) => void
  setTaskStatus: (taskId: string, status: ActiveTask['status']) => void
  /** 从进行中列表移除（取消 / 完成 / 失败时由编排方调用） */
  removeTask: (taskId: string) => void
}

export const useActiveTasksStore = create<ActiveTasksStore>((set) => ({
  activeTasks: [],

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

  removeTask: (taskId) =>
    set((state) => ({
      activeTasks: state.activeTasks.filter((t) => t.taskId !== taskId),
    })),
}))
