// 共享类型定义（主进程 + 渲染进程通用）

export interface DownloadTask {
  id: string
  url: string
  title: string
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'paused'
  progress: number
  speed: string
  eta: string
  fileSize: string
  outputPath: string
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  defaultFormat: string
  downloadPath: string
  namingRule: string
  enableNotification: boolean
  cookiesPath?: string
}

// yt-dlp 相关类型

export interface VideoFormat {
  id: string
  ext: string
  resolution: string
  filesize: number | null
  vcodec: string
  acodec: string
  tbr: number | null
  note: string
  protocol: string
}

export interface VideoInfo {
  title: string
  author: string
  duration: number
  thumbnail: string
  webpage_url: string
  formats: VideoFormat[]
}

export interface DownloadOptions {
  url: string
  formatId?: string
  outputPath: string
  proxy?: string
  taskId: string
}

export interface DownloadProgress {
  taskId: string
  progress: number
  speed: string
  eta: string
  filesize: string
}

export interface YtdlpInfo {
  available: boolean
  path: string
  version: string
}

export interface SearchResult {
  id: string
  url: string
  title: string
  duration?: number
  thumbnail?: string
  author?: string
  viewCount?: number
  uploadDate?: string
}

export const COOKIE_ERROR_CODE = 'COOKIE_READ_FAILED'

export type TaskStatus = 'success' | 'failed' | 'timeout' | 'cancelled' | 'cookie_error'

export interface TaskResult<T = unknown> {
  taskId: string
  status: TaskStatus
  data?: T
  errorMessage?: string
}
