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

export interface SubtitleOptions {
  enabled: boolean
  languages: string[]      // ['zh', 'zh-Hans', 'zh-CN'] 等 yt-dlp 语言代码
  includeAuto: boolean     // --write-auto-subs
  embed: boolean           // --embed-subs
  convertToSrt: boolean    // --convert-subs srt
}

export interface WhisperConfig {
  executablePath: string    // whisper-cli.exe / main.exe 绝对路径
  modelPath: string         // ggml-*.bin 绝对路径
  language: string          // 'auto' / 'zh' / 'en' / 'ja' ...
  threads: number           // 默认 4
}

export type FolderOrganize = 'none' | 'by-date' | 'by-channel' | 'by-channel-date'

export interface AppSettings {
  defaultFormat: string
  downloadPath: string
  namingRule: string
  enableNotification: boolean
  cookiesPath?: string
  subtitles?: SubtitleOptions
  whisper?: WhisperConfig
  subscriptionCheckInterval?: CheckInterval
  maxConcurrentDownloads?: number  // 1-5，默认 3
  folderOrganize?: FolderOrganize  // 默认 'none'
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

export interface VideoChapter {
  title: string
  start_time: number
  end_time?: number
}

export interface VideoInfo {
  title: string
  author: string
  duration: number
  thumbnail: string
  webpage_url: string
  formats: VideoFormat[]
  description?: string
  tags?: string[]
  categories?: string[]
  viewCount?: number
  likeCount?: number
  uploadDate?: string       // YYYYMMDD
  chapters?: VideoChapter[]
}

export interface DownloadOptions {
  url: string
  formatId?: string
  outputPath: string
  proxy?: string
  taskId: string
  subtitles?: SubtitleOptions
  section?: { start: number; end: number; title: string }  // 章节/自定义裁剪
  audioOnly?: boolean                                       // 仅下载音频（mp3）
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

export type FrameMode = 'uniform' | 'scene' | 'timestamps'

export interface FrameExtractOptions {
  videoPath: string
  mode: FrameMode
  count?: number              // uniform 模式下的张数
  sceneThreshold?: number     // scene 模式的阈值（0-1，默认 0.3）
  timestamps?: string[]       // timestamps 模式：['00:30', '01:15'] 或秒数字符串
  outputDir?: string          // 留空则自动：<视频目录>/<视频名>_frames/
  quality?: number            // JPG 质量 2-31，数字越小质量越好（ffmpeg -q:v）
}

export interface FrameExtractResult {
  outputDir: string
  frameCount: number
}

export interface TranscribeOptions {
  videoPath: string
  config: WhisperConfig
  taskId: string
  outputDir?: string        // 默认：视频同目录
  overwrite?: boolean       // 同名 .srt 存在时是否覆盖
}

export interface TranscribeProgress {
  taskId: string
  progress: number          // 0-100
  stage: 'extracting-audio' | 'transcribing' | 'done'
  lastLine?: string         // 最新一行 whisper 输出
}

export interface TranscribeResult {
  srtPath: string
}

export interface VideoListItem {
  id: string
  title: string
  url: string
  thumbnail: string
  uploadDate?: string        // YYYYMMDD
  duration?: number
  viewCount?: number
}

export interface VideoListResult {
  channelName?: string
  videos: VideoListItem[]
}

export type CheckInterval = 'hourly' | '6h' | 'daily' | 'off'

export interface ChannelSubscription {
  id: string
  name: string
  url: string
  lastCheckedAt: number      // 0 = 从未检查
  enabled: boolean
  newCount: number
  group?: string             // 分组名（''/缺省 = 未分组）
  pinned: boolean            // 是否置顶
}

export interface NewVideoItem {
  id: string                 // 视频 ID（与 channelId 组成复合主键）
  channelId: string
  title: string
  url: string
  thumbnail: string
  uploadDate?: string        // YYYYMMDD
  duration?: number
  discoveredAt: number
  status: 'new' | 'dismissed'
}

export type TaskStatus = 'success' | 'failed' | 'timeout' | 'cancelled' | 'cookie_error'

export interface TaskResult<T = unknown> {
  taskId: string
  status: TaskStatus
  data?: T
  errorMessage?: string
}
