import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  DownloadOptions,
  DownloadProgress,
  VideoInfo,
  YtdlpInfo,
  SearchResult,
  FrameExtractOptions,
  FrameExtractResult,
  TranscribeOptions,
  TranscribeProgress,
  TranscribeResult,
  WhisperConfig,
  TaskResult,
  ChannelSubscription,
  NewVideoItem,
  CheckInterval,
  VideoListResult,
  NetworkTestResult,
  IpInfo,
  LlmConfig,
  TitleAnalysisInput,
  TitleAnalysisResult,
  ChannelAnalysisInput,
  ChannelAnalysisResult,
  VideoAnalysisRecord,
  VideoTranscript,
  VideoGrowthStat,
} from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
})

contextBridge.exposeInMainWorld('api', {
  /** 解析视频信息 */
  parseVideo: (url: string, proxy?: string): Promise<TaskResult<VideoInfo>> =>
    ipcRenderer.invoke('parse-video', url, proxy),

  /** 搜索素材视频 */
  searchVideos: (keyword: string, limit?: number, proxy?: string): Promise<TaskResult<SearchResult[]>> =>
    ipcRenderer.invoke('search-videos', keyword, limit, proxy),

  /** 拉取频道/播放列表的视频列表（基于 yt-dlp --flat-playlist） */
  fetchVideoList: (
    url: string,
    limit?: number,
    proxy?: string,
  ): Promise<
    | { status: 'success'; data: VideoListResult }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('ytdlp:fetch-video-list', url, limit, proxy),

  /** 开始下载，返回 TaskResult（status=success 时 data 为最终文件路径） */
  downloadVideo: (options: DownloadOptions): Promise<TaskResult<string>> =>
    ipcRenderer.invoke('download-video', options),

  /** 取消下载 */
  cancelDownload: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke('cancel-download', taskId),

  /** 监听下载进度推送 */
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress) =>
      callback(progress)
    ipcRenderer.on('download-progress', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('download-progress', handler)
  },

  /** 取消解析 */
  cancelParse: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke('cancel-parse', taskId),

  /** 检测 yt-dlp 可用性 */
  detectYtdlp: (): Promise<YtdlpInfo> => ipcRenderer.invoke('detect-ytdlp'),

  /** 更新 yt-dlp 到最新版本 */
  ytdlpUpdate: (): Promise<{ success: boolean; output: string }> =>
    ipcRenderer.invoke('ytdlp:update'),

  /** 获取系统下载目录 */
  getDownloadsPath: (): Promise<string> => ipcRenderer.invoke('get-downloads-path'),

  /** 在系统文件管理器中显示文件 */
  showItemInFolder: (filepath: string): Promise<void> =>
    ipcRenderer.invoke('show-item-in-folder', filepath),

  /** 用系统默认程序打开文件 */
  openFile: (filepath: string): Promise<string> =>
    ipcRenderer.invoke('open-file', filepath),

  /** 读取文本文件内容 */
  readTextFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-text-file', filePath),

  /** 批量检测多个路径是否存在 */
  checkPaths: (paths: string[]): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('fs:check-paths', paths),

  /** 获取磁盘可用空间 */
  getDiskSpace: (dirPath: string): Promise<{ available: number; total: number }> =>
    ipcRenderer.invoke('fs:get-disk-space', dirPath),

  // ---- 数据库 ----

  /** 获取所有已完成记录 */
  dbGetCompletedRecords: (): Promise<unknown[]> =>
    ipcRenderer.invoke('db:get-completed-records'),

  /** 插入一条已完成记录 */
  dbInsertCompletedRecord: (record: unknown): Promise<void> =>
    ipcRenderer.invoke('db:insert-completed-record', record),

  /** 删除一条已完成记录 */
  dbDeleteCompletedRecord: (id: string): Promise<void> =>
    ipcRenderer.invoke('db:delete-completed-record', id),

  /** 更新一条已完成记录的标签（逗号分隔字符串） */
  dbUpdateCompletedRecordTags: (id: string, tags: string): Promise<void> =>
    ipcRenderer.invoke('db:update-completed-record-tags', id, tags),

  /** 获取所有失败记录 */
  dbGetFailedRecords: (): Promise<unknown[]> =>
    ipcRenderer.invoke('db:get-failed-records'),

  /** 插入一条失败记录 */
  dbInsertFailedRecord: (record: unknown): Promise<void> =>
    ipcRenderer.invoke('db:insert-failed-record', record),

  /** 删除一条失败记录 */
  dbDeleteFailedRecord: (id: string): Promise<void> =>
    ipcRenderer.invoke('db:delete-failed-record', id),

  /** 清空所有已完成记录 */
  dbClearAllCompleted: (): Promise<number> =>
    ipcRenderer.invoke('db:clear-all-completed'),

  /** 清空所有失败记录 */
  dbClearAllFailed: (): Promise<number> =>
    ipcRenderer.invoke('db:clear-all-failed'),

  /** 选择目录 */
  selectDirectory: (defaultPath?: string): Promise<string | undefined> =>
    ipcRenderer.invoke('select-directory', defaultPath),

  /** 选择文件 */
  selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | undefined> =>
    ipcRenderer.invoke('select-file', filters),

  /** 同步 cookies 文件路径到主进程 */
  setCookiesPath: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('set-cookies-path', filePath),

  /** 设置抖音 Cookie 来源浏览器 */
  setDouyinBrowser: (browser: string): Promise<void> =>
    ipcRenderer.invoke('set-douyin-browser', browser),

  /** 设置国内平台独立 cookies 文件路径 */
  setDomesticCookiesPath: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('set-domestic-cookies-path', filePath),

  /** 打开 YouTube 登录窗口，关闭后自动导出 cookie */
  openLoginWindow: (): Promise<void> =>
    ipcRenderer.invoke('open-login-window'),

  /** 监听 cookies 路径更新事件（登录窗口关闭后触发） */
  onCookiesPathUpdated: (callback: (filePath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, filePath: string) =>
      callback(filePath)
    ipcRenderer.on('cookies-path-updated', handler)
    return () => ipcRenderer.removeListener('cookies-path-updated', handler)
  },

  /** 发送系统通知 */
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-notification', title, body),

  /** 打开日志文件夹 */
  openLogsFolder: (): Promise<void> =>
    ipcRenderer.invoke('open-logs-folder'),

  /** 检测 ffmpeg/ffprobe 是否就绪 */
  ffmpegReady: (): Promise<{ ffmpeg: boolean; ffprobe: boolean }> =>
    ipcRenderer.invoke('ffmpeg:ready'),

  /** 从视频中提取关键帧 */
  extractFrames: (
    options: FrameExtractOptions,
  ): Promise<
    | { status: 'success'; data: FrameExtractResult }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('ffmpeg:extract-frames', options),

  /** 检测 Whisper 配置是否就绪 */
  whisperReady: (cfg: WhisperConfig | undefined): Promise<{ ready: boolean; reason?: string }> =>
    ipcRenderer.invoke('whisper:ready', cfg),

  /** 转写视频生成 srt */
  transcribeVideo: (options: TranscribeOptions): Promise<TaskResult<TranscribeResult>> =>
    ipcRenderer.invoke('whisper:transcribe', options),

  /** 取消转写任务 */
  cancelTranscribe: (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke('whisper:cancel', taskId),

  /** 监听转写进度 */
  onTranscribeProgress: (callback: (p: TranscribeProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, p: TranscribeProgress) => callback(p)
    ipcRenderer.on('transcribe-progress', handler)
    return () => ipcRenderer.removeListener('transcribe-progress', handler)
  },

  // ---- 频道订阅 ----

  subList: (): Promise<ChannelSubscription[]> => ipcRenderer.invoke('sub:list'),

  subAdd: (
    url: string,
    customName?: string,
  ): Promise<
    | { status: 'success'; data: ChannelSubscription }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('sub:add', url, customName),

  subRemove: (id: string): Promise<void> => ipcRenderer.invoke('sub:remove', id),

  subToggle: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('sub:toggle', id, enabled),

  subSetGroup: (id: string, groupName: string): Promise<void> =>
    ipcRenderer.invoke('sub:set-group', id, groupName),

  subSetPinned: (id: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke('sub:set-pinned', id, pinned),

  subCheck: (
    id: string,
  ): Promise<
    | { status: 'success'; data: NewVideoItem[] }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('sub:check', id),

  subCheckAll: (): Promise<{ subId: string; subName: string; newVideos: NewVideoItem[]; err?: string }[]> =>
    ipcRenderer.invoke('sub:check-all'),

  subListNewVideos: (channelId?: string): Promise<NewVideoItem[]> =>
    ipcRenderer.invoke('sub:new-videos', channelId),

  subDismissNewVideo: (videoId: string, channelId: string): Promise<void> =>
    ipcRenderer.invoke('sub:dismiss', videoId, channelId),

  subClearNewVideos: (channelId: string): Promise<number> =>
    ipcRenderer.invoke('sub:clear-new', channelId),

  subSetInterval: (interval: CheckInterval): Promise<void> =>
    ipcRenderer.invoke('sub:set-interval', interval),

  onSubSchedulerTick: (callback: (info: { totalNew: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { totalNew: number }) =>
      callback(info)
    ipcRenderer.on('sub:scheduler-tick', handler)
    return () => ipcRenderer.removeListener('sub:scheduler-tick', handler)
  },

  /** 应用代理设置（同步到 Electron session 和 yt-dlp） */
  setProxy: (type: string, host?: string, port?: string, username?: string, password?: string): Promise<void> =>
    ipcRenderer.invoke('set-proxy', type, host, port, username, password),

  /** 测试各平台连通性 */
  testNetwork: (): Promise<NetworkTestResult[]> =>
    ipcRenderer.invoke('test-network'),

  /** 获取当前 IP 信息 */
  getIpInfo: (): Promise<IpInfo | null> =>
    ipcRenderer.invoke('get-ip-info'),

  /** 获取拖拽进来的 File 对象的本地绝对路径（Electron 32+ 必须用此方法） */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  /** 字幕提取（使用 yt-dlp 仅下载字幕） */
  extractSubtitles: (
    url: string,
    outputDir: string,
    langs?: string,
  ): Promise<{
    status: 'success' | 'failed'
    title?: string
    duration?: number
    srtPaths?: string[]
    errorMessage?: string
  }> => ipcRenderer.invoke('extract-subtitles', url, outputDir, langs),

  // ---- YouTube Data API ----
  ytApiSetKey: (key: string | null): Promise<void> => ipcRenderer.invoke('ytapi:set-key', key),

  ytApiTest: (key: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('ytapi:test', key),

  /** 播放量增速（24h 日增，基于快照） */
  subGrowthStats: (): Promise<VideoGrowthStat[]> => ipcRenderer.invoke('sub:growth'),

  // ---- LLM（AI 分析） ----
  llmTest: (cfg: LlmConfig): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('llm:test', cfg),

  llmAnalyzeTitle: (
    cfg: LlmConfig,
    input: TitleAnalysisInput,
    save?: { videoId: string; channelId: string },
  ): Promise<
    | { status: 'success'; data: TitleAnalysisResult }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('llm:analyze-title', cfg, input, save),

  llmAnalyzeChannel: (
    cfg: LlmConfig,
    input: ChannelAnalysisInput,
  ): Promise<
    | { status: 'success'; data: ChannelAnalysisResult }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('llm:analyze-channel', cfg, input),

  llmSetConfig: (cfg: LlmConfig | null, autoAnalyzeHot: boolean): Promise<void> =>
    ipcRenderer.invoke('llm:set-config', cfg, autoAnalyzeHot),

  analysisGet: (videoId: string, channelId: string): Promise<VideoAnalysisRecord | null> =>
    ipcRenderer.invoke('analysis:get', videoId, channelId),

  analysisKeys: (): Promise<{ videoId: string; channelId: string }[]> =>
    ipcRenderer.invoke('analysis:keys'),

  onAnalysisAutoDone: (
    callback: (info: { channelId: string; channelName: string; videoId: string; videoTitle: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { channelId: string; channelName: string; videoId: string; videoTitle: string },
    ) => callback(info)
    ipcRenderer.on('analysis:auto-done', handler)
    return () => ipcRenderer.removeListener('analysis:auto-done', handler)
  },

  // ---- 视频文案（字幕提取入库） ----
  transcriptGet: (videoId: string, channelId: string): Promise<VideoTranscript | null> =>
    ipcRenderer.invoke('transcript:get', videoId, channelId),

  transcriptOpening: (videoId: string, channelId: string, seconds?: number): Promise<string | null> =>
    ipcRenderer.invoke('transcript:opening', videoId, channelId, seconds),

  transcriptFetch: (
    video: { id: string; channelId: string; url: string; title: string },
    force?: boolean,
  ): Promise<
    | { status: 'success'; data: VideoTranscript }
    | { status: 'failed'; errorMessage: string }
  > => ipcRenderer.invoke('transcript:fetch', video, force),

  // ---- 选题灵感库 ----
  topicList: (): Promise<unknown[]> => ipcRenderer.invoke('topic:list'),
  topicInsert: (row: unknown): Promise<void> => ipcRenderer.invoke('topic:insert', row),
  topicUpdate: (id: string, fields: unknown): Promise<void> => ipcRenderer.invoke('topic:update', id, fields),
  topicDelete: (id: string): Promise<void> => ipcRenderer.invoke('topic:delete', id),
})
