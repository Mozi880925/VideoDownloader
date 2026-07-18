import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'
import { storageGet, storageSet } from '../utils/storage'
import { friendlyError } from '../../shared/errorTranslator'

// ────────── 转录任务队列（模块级 store + 执行器）──────────
// 任务队列与执行循环都在模块级：切页面/切 Tab/组件重挂载都不会中断
// 正在进行的转录（此前执行循环在组件内，卸载即断，是真实踩过的坑）。
// 应用重启后残留的 processing 任务才标记为失败，可一键重试续跑。

// 注意：此处 TranscribeStatus 与 shared/types.ts 的 TaskStatus 语义不同，特意区分命名
export type TranscribeStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface TranscribeTask {
  id: string
  title: string
  sourceType: 'url' | 'file'
  sourcePath: string       // URL 或本地文件路径
  addedAt: number
  duration?: number        // 秒
  status: TranscribeStatus
  progress: number         // 0-100（URL 任务：下载 0-40，转录 40-100）
  stage?: 'downloading' | 'transcribing'   // URL 任务的两阶段
  speed?: string            // 下载阶段：实时速度（如 6.2MiB/s）
  lastLine?: string         // 转录阶段：whisper 最新输出行（含时间戳，可见"正转到哪句"）
  outputPath?: string      // 生成的 .srt 路径
  errorMessage?: string
}

const STORAGE_KEY = 'vd_transcribe_tasks'

function loadTasks(): TranscribeTask[] {
  try {
    const parsed = storageGet<TranscribeTask[]>(STORAGE_KEY, [])
    // 应用重启后残留的 processing 任务：主进程 whisper 已不在，标记失败（可重试续跑）
    return parsed.map(t => t.status === 'processing'
      ? { ...t, status: 'failed' as TranscribeStatus, errorMessage: '应用重启导致中断，点击重试即可续跑（已下载的音频会秒过）' }
      : t)
  } catch { return [] }
}

interface TranscribeStore {
  tasks: TranscribeTask[]
  addTasks: (tasks: TranscribeTask[]) => void
  patchTask: (id: string, patch: Partial<TranscribeTask>) => void
  removeTask: (id: string) => void
  clearAll: () => void
  /** 失败任务重置为待处理（保留来源，无需重新输入链接/选文件） */
  retryTask: (id: string) => void
}

export const useTranscribeStore = create<TranscribeStore>((set) => ({
  tasks: loadTasks(),

  addTasks: (newTasks) => set((s) => ({ tasks: [...s.tasks, ...newTasks] })),

  patchTask: (id, patch) => set((s) => ({
    tasks: s.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)),
  })),

  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter(t => t.id !== id) })),

  clearAll: () => set({ tasks: [] }),

  retryTask: (id) => set((s) => ({
    tasks: s.tasks.map(t => (t.id === id
      ? { ...t, status: 'pending' as TranscribeStatus, progress: 0, stage: undefined, speed: undefined, lastLine: undefined, errorMessage: undefined }
      : t)),
  })),
}))

// tasks 变化时自动持久化（模块级订阅一次）
useTranscribeStore.subscribe((s) => storageSet(STORAGE_KEY, s.tasks))

// ────────── 执行器（模块级，不随组件卸载死亡）──────────

let processing = false

export function isTranscribeQueueRunning(): boolean {
  return processing
}

export type StartQueueResult =
  | { started: true }
  | { started: false; reason: string }

/**
 * 启动队列处理：逐个消费 pending 任务（执行中新增/重试的任务也会被接上）。
 * 已在运行时调用直接返回 started: true（新任务会被现有循环拾取）。
 */
export function runTranscribeQueue(): StartQueueResult {
  const whisper = useSettingsStore.getState().appSettings.whisper
  if (!whisper?.executablePath) {
    return { started: false, reason: '请先到「设置 → 字幕设置」配置 Whisper 可执行文件路径' }
  }
  if (!whisper?.modelPath) {
    return { started: false, reason: '请先到「设置 → 字幕设置」配置 Whisper 模型文件路径' }
  }
  if (processing) return { started: true }

  const hasPending = useTranscribeStore.getState().tasks.some(t => t.status === 'pending')
  if (!hasPending) return { started: false, reason: '没有待处理的任务' }

  processing = true
  void (async () => {
    try {
      // 每轮从最新 state 取下一个 pending：执行期间新增/重试的任务自然接上
      for (;;) {
        const task = useTranscribeStore.getState().tasks.find(t => t.status === 'pending')
        if (!task) break
        await processOne(task)
      }
    } finally {
      processing = false
    }
  })()
  return { started: true }
}

async function processOne(task: TranscribeTask): Promise<void> {
  const { patchTask } = useTranscribeStore.getState()
  const whisper = useSettingsStore.getState().appSettings.whisper!
  let videoPath = task.sourcePath
  const isUrl = task.sourceType === 'url'

  // ── URL 任务：阶段一，先用 yt-dlp 提取音频到本地（进度映射 0-40%）──
  if (isUrl) {
    patchTask(task.id, { status: 'processing', progress: 0, stage: 'downloading' })
    const baseDir = useSettingsStore.getState().appSettings.downloadPath
      || await window.api.getDownloadsPath().catch(() => '')
    if (!baseDir) {
      patchTask(task.id, { status: 'failed', errorMessage: '无法确定下载目录，请到设置里指定' })
      return
    }
    const unsubDl = window.api.onDownloadProgress((p) => {
      if (p.taskId === task.id) {
        patchTask(task.id, { progress: Math.round(p.progress * 0.4), speed: p.speed })
      }
    })
    try {
      const dl = await window.api.downloadVideo({
        url: task.sourcePath,
        taskId: task.id,
        audioOnly: true,
        outputPath: `${baseDir}/transcribe-audio/%(title).80s.%(ext)s`,
      })
      unsubDl()
      if (dl.status !== 'success' || !dl.data) {
        patchTask(task.id, { status: 'failed', errorMessage: `音频下载失败：${friendlyError(dl.errorMessage || '')}` })
        return
      }
      videoPath = dl.data
      // 下载完成：标题换成真实文件名，进入转录阶段
      patchTask(task.id, { title: fileName(videoPath), stage: 'transcribing', progress: 40 })
    } catch (err: unknown) {
      unsubDl()
      patchTask(task.id, { status: 'failed', errorMessage: `音频下载失败：${String(err)}` })
      return
    }
  } else {
    patchTask(task.id, { status: 'processing', progress: 0, stage: 'transcribing' })
  }

  // ── 复用已有字幕：音频旁已存在同名 .srt 则直接完成 ──
  // whisper.cpp 只在整段转录结束后才写出 srt，存在即完整。典型场景：
  // 上次"中断"的任务 whisper 实际在主进程后台跑完了，重试时直接秒完成。
  const expectedSrt = videoPath.replace(/\.[^.]+$/, '.srt')
  try {
    const exists = await window.api.checkPaths([expectedSrt])
    if (exists[expectedSrt]) {
      patchTask(task.id, { status: 'completed', progress: 100, outputPath: expectedSrt, stage: undefined })
      return
    }
  } catch { /* 检查失败则正常转录 */ }

  // ── 阶段二：Whisper 转录（URL 任务进度映射 40-100%，本地文件 0-100%）──
  const unsub = window.api.onTranscribeProgress((p) => {
    if (p.taskId === task.id) {
      const current = useTranscribeStore.getState().tasks.find(t => t.id === task.id)
      patchTask(task.id, {
        progress: isUrl ? 40 + Math.round(p.progress * 0.6) : Math.round(p.progress),
        lastLine: p.lastLine ?? current?.lastLine,
      })
    }
  })

  try {
    const result = await window.api.transcribeVideo({
      videoPath,
      config: whisper,
      taskId: task.id,
      // 上方已做复用检测，走到这里说明用户确需重转（或竞态残留），直接覆盖
      overwrite: true,
    })
    unsub()
    if (result.status === 'success') {
      patchTask(task.id, { status: 'completed', progress: 100, outputPath: result.data?.srtPath })
    } else {
      patchTask(task.id, { status: 'failed', errorMessage: result.errorMessage || '转录失败' })
    }
  } catch (err: unknown) {
    unsub()
    patchTask(task.id, { status: 'failed', errorMessage: String(err) })
  }
}

function fileName(p: string): string {
  if (!p) return '-'
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1]
}
