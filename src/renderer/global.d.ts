import type { TaskStatus, TaskResult, NetworkTestResult, IpInfo } from '../shared/types'

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

  interface VideoChapter {
    title: string
    start_time: number
    end_time?: number
  }

  interface VideoInfo {
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
    uploadDate?: string
    chapters?: VideoChapter[]
  }

  interface SubtitleOptions {
    enabled: boolean
    languages: string[]
    includeAuto: boolean
    embed: boolean
    convertToSrt: boolean
  }

  interface DownloadOptions {
    url: string
    formatId?: string
    outputPath: string
    proxy?: string
    taskId: string
    subtitles?: SubtitleOptions
    section?: { start: number; end: number; title: string }
    audioOnly?: boolean
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
    fetchVideoList: (
      url: string,
      limit?: number,
      proxy?: string,
    ) => Promise<
      | { status: 'success'; data: VideoListResult }
      | { status: 'failed'; errorMessage: string }
    >
    downloadVideo: (options: DownloadOptions) => Promise<TaskResult<string>>
    cancelDownload: (taskId: string) => Promise<boolean>
    cancelParse: (taskId: string) => Promise<boolean>
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
    detectYtdlp: () => Promise<YtdlpInfo>
    getDownloadsPath: () => Promise<string>
    showItemInFolder: (filepath: string) => Promise<void>
    openFile: (filepath: string) => Promise<string>
    readTextFile: (filePath: string) => Promise<string>
    checkPaths: (paths: string[]) => Promise<Record<string, boolean>>
    getDiskSpace: (dirPath: string) => Promise<{ available: number; total: number }>
    dbGetCompletedRecords: () => Promise<CompletedRecordRow[]>
    dbInsertCompletedRecord: (record: CompletedRecordRow) => Promise<void>
    dbDeleteCompletedRecord: (id: string) => Promise<void>
    dbUpdateCompletedRecordTags: (id: string, tags: string) => Promise<void>
    dbGetFailedRecords: () => Promise<FailedRecordRow[]>
    dbInsertFailedRecord: (record: FailedRecordRow) => Promise<void>
    dbDeleteFailedRecord: (id: string) => Promise<void>
    dbClearAllCompleted: () => Promise<number>
    dbClearAllFailed: () => Promise<number>
    selectDirectory: (defaultPath?: string) => Promise<string | undefined>
    selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | undefined>
    setCookiesPath: (filePath: string) => Promise<void>
    setDouyinBrowser: (browser: string) => Promise<void>
    openLoginWindow: () => Promise<void>
    onCookiesPathUpdated: (callback: (filePath: string) => void) => () => void
    ytdlpUpdate: () => Promise<{ success: boolean; output: string }>
    showNotification: (title: string, body: string) => Promise<void>
    openLogsFolder: () => Promise<void>
    ffmpegReady: () => Promise<{ ffmpeg: boolean; ffprobe: boolean }>
    extractFrames: (
      options: FrameExtractOptions,
    ) => Promise<
      | { status: 'success'; data: FrameExtractResult }
      | { status: 'failed'; errorMessage: string }
    >
    whisperReady: (cfg: WhisperConfig | undefined) => Promise<{ ready: boolean; reason?: string }>
    transcribeVideo: (options: TranscribeOptions) => Promise<TaskResult<TranscribeResult>>
    cancelTranscribe: (taskId: string) => Promise<boolean>
    onTranscribeProgress: (callback: (p: TranscribeProgress) => void) => () => void

    // 频道订阅
    subList: () => Promise<ChannelSubscription[]>
    subAdd: (
      url: string,
      customName?: string,
    ) => Promise<
      | { status: 'success'; data: ChannelSubscription }
      | { status: 'failed'; errorMessage: string }
    >
    subRemove: (id: string) => Promise<void>
    subToggle: (id: string, enabled: boolean) => Promise<void>
    subSetGroup: (id: string, groupName: string) => Promise<void>
    subSetPinned: (id: string, pinned: boolean) => Promise<void>
    subCheck: (
      id: string,
    ) => Promise<
      | { status: 'success'; data: NewVideoItem[] }
      | { status: 'failed'; errorMessage: string }
    >
    subCheckAll: () => Promise<
      { subId: string; subName: string; newVideos: NewVideoItem[]; err?: string }[]
    >
    subListNewVideos: (channelId?: string) => Promise<NewVideoItem[]>
    subDismissNewVideo: (videoId: string, channelId: string) => Promise<void>
    subClearNewVideos: (channelId: string) => Promise<number>
    subSetInterval: (interval: CheckInterval) => Promise<void>
    onSubSchedulerTick: (callback: (info: { totalNew: number }) => void) => () => void

    // 网络 / 代理
    setProxy: (type: string, host?: string, port?: string, username?: string, password?: string) => Promise<void>
    testNetwork: () => Promise<NetworkTestResult[]>
    getIpInfo: () => Promise<IpInfo | null>

    // 拖拽文件路径
    getPathForFile: (file: File) => string

    // 字幕提取
    extractSubtitles: (url: string, outputDir: string, langs?: string) => Promise<{
      status: 'success' | 'failed'
      title?: string
      duration?: number
      srtPaths?: string[]
      errorMessage?: string
    }>

    // 视频文案（字幕提取入库）
    transcriptGet: (videoId: string, channelId: string) => Promise<VideoTranscript | null>
    transcriptOpening: (videoId: string, channelId: string, seconds?: number) => Promise<string | null>
    transcriptFetch: (
      video: { id: string; channelId: string; url: string; title: string },
      force?: boolean,
    ) => Promise<
      | { status: 'success'; data: VideoTranscript }
      | { status: 'failed'; errorMessage: string }
    >

    // LLM（AI 分析）
    llmTest: (cfg: LlmConfig) => Promise<{ ok: boolean; message: string }>
    llmAnalyzeTitle: (
      cfg: LlmConfig,
      input: TitleAnalysisInput,
    ) => Promise<
      | { status: 'success'; data: TitleAnalysisResult }
      | { status: 'failed'; errorMessage: string }
    >

    // 选题灵感库
    topicList: () => Promise<TopicIdea[]>
    topicInsert: (row: TopicIdea) => Promise<void>
    topicUpdate: (id: string, fields: Partial<TopicIdea>) => Promise<void>
    topicDelete: (id: string) => Promise<void>
  }

  // LLM 相关类型，与 src/shared/types.ts 保持同步
  interface LlmConfig {
    baseUrl: string
    apiKey: string
    model: string
  }

  interface TitleAnalysisInput {
    title: string
    viewCount?: number
    channelName?: string
    siblings: { title: string; viewCount?: number }[]
    openingText?: string
  }

  interface TitleAnalysis {
    structure: string
    hooks: string[]
    emotion: string
    templates: string[]
    suggestions: string[]
    opening?: string
  }

  interface VideoTranscript {
    videoId: string
    channelId: string
    url: string
    title: string
    language: string
    text: string
    createdAt: number
  }

  interface TitleAnalysisResult {
    raw: string
    parsed?: TitleAnalysis
  }

  // CheckInterval 与 src/shared/types.ts 保持同步
  type CheckInterval = 'hourly' | '6h' | 'daily' | 'off'

  type TopicStatus = 'pending' | 'planned' | 'filming' | 'published'

  interface TopicIdea {
    id: string
    title: string
    notes: string
    ref_url: string
    ref_title: string
    ref_thumbnail: string
    status: TopicStatus
    created_at: number
    updated_at: number
  }

  interface VideoListItem {
    id: string
    title: string
    url: string
    thumbnail: string
    uploadDate?: string
    duration?: number
    viewCount?: number
  }

  interface VideoListResult {
    channelName?: string
    videos: VideoListItem[]
  }

  interface ChannelSubscription {
    id: string
    name: string
    url: string
    lastCheckedAt: number
    enabled: boolean
    newCount: number
    group?: string
    pinned: boolean
  }

  interface NewVideoItem {
    id: string
    channelId: string
    title: string
    url: string
    thumbnail: string
    uploadDate?: string
    duration?: number
    viewCount?: number
    discoveredAt: number
    status: 'new' | 'dismissed' | 'seen'
  }

  interface WhisperConfig {
    executablePath: string
    modelPath: string
    language: string
    threads: number
  }

  interface TranscribeOptions {
    videoPath: string
    config: WhisperConfig
    taskId: string
    outputDir?: string
    overwrite?: boolean
  }

  interface TranscribeProgress {
    taskId: string
    progress: number
    stage: 'extracting-audio' | 'transcribing' | 'done'
    lastLine?: string
  }

  interface TranscribeResult {
    srtPath: string
  }

  type FrameMode = 'uniform' | 'scene' | 'timestamps'

  interface FrameExtractOptions {
    videoPath: string
    mode: FrameMode
    count?: number
    sceneThreshold?: number
    timestamps?: string[]
    outputDir?: string
    quality?: number
  }

  interface FrameExtractResult {
    outputDir: string
    frameCount: number
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
    tags: string
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
