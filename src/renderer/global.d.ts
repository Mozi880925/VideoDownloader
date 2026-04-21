import type { TaskStatus, TaskResult } from '../shared/types'

declare global {
  interface ElectronAPI {
    ping: () => Promise<string>
    minimize: () => void
    maximize: () => void
    close: () => void
  }

  interface VideoFormat {
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

  interface VideoInfo {
    title: string
    author: string
    duration: number
    thumbnail: string
    webpage_url: string
    formats: VideoFormat[]
  }

  interface DownloadOptions {
    url: string
    formatId?: string
    outputPath: string
    proxy?: string
    taskId: string
  }

  interface DownloadProgress {
    taskId: string
    progress: number
    speed: string
    eta: string
    filesize: string
  }

  interface YtdlpInfo {
    available: boolean
    path: string
    version: string
  }

  interface SearchResult {
    id: string
    url: string
    title: string
    duration?: number
    thumbnail?: string
    author?: string
    viewCount?: number
    uploadDate?: string
  }

  interface RendererAPI {
    parseVideo: (url: string, proxy?: string) => Promise<TaskResult<VideoInfo>>
    searchVideos: (keyword: string, limit?: number, proxy?: string) => Promise<TaskResult<SearchResult[]>>
    downloadVideo: (options: DownloadOptions) => Promise<TaskResult<string>>
    cancelDownload: (taskId: string) => Promise<boolean>
    cancelParse: (taskId: string) => Promise<boolean>
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
    detectYtdlp: () => Promise<YtdlpInfo>
    getDownloadsPath: () => Promise<string>
    showItemInFolder: (filepath: string) => Promise<void>
    openFile: (filepath: string) => Promise<string>
    dbGetCompletedRecords: () => Promise<CompletedRecordRow[]>
    dbInsertCompletedRecord: (record: CompletedRecordRow) => Promise<void>
    dbDeleteCompletedRecord: (id: string) => Promise<void>
    dbGetFailedRecords: () => Promise<FailedRecordRow[]>
    dbInsertFailedRecord: (record: FailedRecordRow) => Promise<void>
    dbDeleteFailedRecord: (id: string) => Promise<void>
    dbClearAllCompleted: () => Promise<number>
    dbClearAllFailed: () => Promise<number>
    selectDirectory: (defaultPath?: string) => Promise<string | undefined>
    selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | undefined>
    setCookiesPath: (filePath: string) => Promise<void>
    openLoginWindow: () => Promise<void>
    onCookiesPathUpdated: (callback: (filePath: string) => void) => () => void
    showNotification: (title: string, body: string) => Promise<void>
    openLogsFolder: () => Promise<void>
  }

  interface CompletedRecordRow {
    id: string
    title: string
    thumbnail: string
    platform: string
    url: string
    filepath: string
    completed_at: number
    status: string
  }

  interface FailedRecordRow {
    id: string
    title: string
    thumbnail: string
    platform: string
    url: string
    error_message: string
    failed_at: number
    status: string
  }

  interface Window {
    electronAPI: ElectronAPI
    api: RendererAPI
  }
}
