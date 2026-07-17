// ────────────────────────────────────────────────────────────────
// IPC 契约唯一真源：通道名 + 参数 + 返回类型在此一处定义。
// preload.ts 用 apiMethods 工厂生成 window.api；
// global.d.ts 用 RendererApi / RendererListeners 派生 Window 类型；
// 主进程用 main/ipc/typed.ts 的 handle()/sendToAll() 消费同一契约。
// 通道命名规范：domain:action；主进程→渲染端推送统一 event:* 前缀。
// ────────────────────────────────────────────────────────────────
import type {
  TaskResult,
  VideoInfo,
  DownloadOptions,
  DownloadProgress,
  YtdlpInfo,
  SearchResult,
  VideoListResult,
  FrameExtractOptions,
  FrameExtractResult,
  TranscribeOptions,
  TranscribeProgress,
  TranscribeResult,
  WhisperConfig,
  ChannelSubscription,
  NewVideoItem,
  CheckInterval,
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
  TopicIdea,
  CompletedRecord,
  FailedRecord,
  AppSettings,
  RadarKeyword,
  RadarChannel,
  RadarScanRun,
  RadarScanProgress,
  DistillStartInput,
  DistilledArticle,
  DistilledArticleMeta,
  DistillProgress,
  FeishuConfig,
} from './types'

/** 无 taskId 的简单操作结果 */
export type OpResult<T> =
  | { status: 'success'; data: T }
  | { status: 'failed'; errorMessage: string }

export interface SubtitleExtractResult {
  status: 'success' | 'failed'
  title?: string
  duration?: number
  srtPaths?: string[]
  errorMessage?: string
}

/** invoke 型通道：channel → { args: 参数元组; result: 返回值 } */
export interface IpcInvokeContract {
  // ---- yt-dlp ----
  'ytdlp:parse-video': { args: [url: string, proxy?: string, taskId?: string]; result: TaskResult<VideoInfo> }
  'ytdlp:search-videos': { args: [keyword: string, limit?: number, proxy?: string]; result: TaskResult<SearchResult[]> }
  'ytdlp:fetch-video-list': { args: [url: string, limit?: number, proxy?: string]; result: OpResult<VideoListResult> }
  'ytdlp:download-video': { args: [options: DownloadOptions]; result: TaskResult<string> }
  'ytdlp:cancel-download': { args: [taskId: string]; result: boolean }
  'ytdlp:cancel-parse': { args: [taskId: string]; result: boolean }
  'ytdlp:detect': { args: []; result: YtdlpInfo }
  'ytdlp:update': { args: []; result: { success: boolean; output: string } }
  'ytdlp:extract-subtitles': { args: [url: string, outputDir: string, langs?: string]; result: SubtitleExtractResult }

  // ---- 应用 / 文件系统 ----
  'app:get-downloads-path': { args: []; result: string }
  'app:show-notification': { args: [title: string, body: string]; result: void }
  'app:open-logs-folder': { args: []; result: void }
  'app:open-external': { args: [url: string]; result: void }
  'fs:show-item-in-folder': { args: [filepath: string]; result: void }
  'fs:open-file': { args: [filepath: string]; result: string }
  'fs:read-text-file': { args: [filePath: string]; result: string }
  'fs:check-paths': { args: [paths: string[]]; result: Record<string, boolean> }
  'fs:get-disk-space': { args: [dirPath: string]; result: { available: number; total: number } }
  'fs:select-directory': { args: [defaultPath?: string]; result: string | undefined }
  'fs:select-file': { args: [filters?: { name: string; extensions: string[] }[]]; result: string | undefined }
  'fs:select-save-path': { args: [defaultFileName?: string, filters?: { name: string; extensions: string[] }[]]; result: string | undefined }
  'fs:write-text-file': { args: [filePath: string, content: string]; result: void }

  // ---- 下载记录（DB）----
  'db:get-completed-records': { args: []; result: CompletedRecord[] }
  'db:insert-completed-record': { args: [record: CompletedRecord]; result: void }
  'db:delete-completed-record': { args: [id: string]; result: void }
  'db:update-completed-record-tags': { args: [id: string, tags: string[]]; result: void }
  'db:get-failed-records': { args: []; result: FailedRecord[] }
  'db:insert-failed-record': { args: [record: FailedRecord]; result: void }
  'db:delete-failed-record': { args: [id: string]; result: void }
  'db:clear-all-completed': { args: []; result: number }
  'db:clear-all-failed': { args: []; result: number }

  // ---- 设置同步（渲染端 localStorage 真源 → 主进程 settingsHub 全量推送）----
  'settings:sync': { args: [settings: AppSettings]; result: void }

  // ---- Cookies ----
  'cookies:open-login-window': { args: []; result: void }

  // ---- ffmpeg / whisper ----
  'ffmpeg:ready': { args: []; result: { ffmpeg: boolean; ffprobe: boolean } }
  'ffmpeg:extract-frames': { args: [options: FrameExtractOptions]; result: OpResult<FrameExtractResult> }
  'whisper:ready': { args: [cfg: WhisperConfig | undefined]; result: { ready: boolean; reason?: string } }
  'whisper:transcribe': { args: [options: TranscribeOptions]; result: TaskResult<TranscribeResult> }
  'whisper:cancel': { args: [taskId: string]; result: boolean }

  // ---- 频道订阅 ----
  'sub:list': { args: []; result: ChannelSubscription[] }
  'sub:add': { args: [url: string, customName?: string]; result: OpResult<ChannelSubscription> }
  'sub:remove': { args: [id: string]; result: void }
  'sub:toggle': { args: [id: string, enabled: boolean]; result: void }
  'sub:set-group': { args: [id: string, groupName: string]; result: void }
  'sub:set-pinned': { args: [id: string, pinned: boolean]; result: void }
  'sub:check': { args: [id: string]; result: OpResult<NewVideoItem[]> }
  'sub:check-all': { args: []; result: { subId: string; subName: string; newVideos: NewVideoItem[]; err?: string }[] }
  'sub:new-videos': { args: [channelId?: string]; result: NewVideoItem[] }
  'sub:dismiss': { args: [videoId: string, channelId: string]; result: void }
  'sub:clear-new': { args: [channelId: string]; result: number }
  'sub:growth': { args: []; result: VideoGrowthStat[] }

  // ---- 网络 / 代理 ----
  'net:test': { args: []; result: NetworkTestResult[] }
  'net:ip-info': { args: []; result: IpInfo | null }

  // ---- YouTube Data API ----
  'ytapi:test': { args: [key: string]; result: { ok: boolean; message: string } }
  'ytapi:get-quota': { args: []; result: { used: number; limit: number } }

  // ---- LLM（AI 分析）----
  'llm:test': { args: [cfg: LlmConfig]; result: { ok: boolean; message: string } }
  'llm:analyze-title': { args: [cfg: LlmConfig, input: TitleAnalysisInput, save?: { videoId: string; channelId: string }]; result: OpResult<TitleAnalysisResult> }
  'llm:analyze-channel': { args: [cfg: LlmConfig, input: ChannelAnalysisInput]; result: OpResult<ChannelAnalysisResult> }
  'analysis:get': { args: [videoId: string, channelId: string]; result: VideoAnalysisRecord | null }
  'analysis:keys': { args: []; result: { videoId: string; channelId: string }[] }

  // ---- 视频文案（字幕提取入库）----
  'transcript:get': { args: [videoId: string, channelId: string]; result: VideoTranscript | null }
  'transcript:opening': { args: [videoId: string, channelId: string, seconds?: number]; result: string | null }
  'transcript:fetch': { args: [video: { id: string; channelId: string; url: string; title: string }, force?: boolean]; result: OpResult<VideoTranscript> }

  // ---- 蓝海雷达 ----
  'radar:list-keywords': { args: []; result: RadarKeyword[] }
  'radar:add-keywords': { args: [keywords: string[]]; result: RadarKeyword[] }
  'radar:remove-keyword': { args: [id: string]; result: void }
  'radar:toggle-keyword': { args: [id: string, enabled: boolean]; result: void }
  'radar:start-scan': { args: []; result: OpResult<{ runId: string }> }
  'radar:stop-scan': { args: []; result: void }
  'radar:list-channels': { args: [opts?: { maxAgeMonths?: number; minSubs?: number }]; result: RadarChannel[] }
  'radar:remove-channel': { args: [channelId: string]; result: void }
  'radar:list-runs': { args: [limit?: number]; result: RadarScanRun[] }

  // ---- AI 提纯整理 ----
  'distill:start': { args: [input: DistillStartInput]; result: OpResult<{ articleId: string }> }
  'distill:retry': { args: [articleId: string]; result: OpResult<{ articleId: string }> }
  'distill:cancel': { args: [articleId: string]; result: boolean }
  'distill:list': { args: []; result: DistilledArticleMeta[] }
  'distill:get': { args: [articleId: string]; result: DistilledArticle | null }
  'distill:delete': { args: [articleId: string]; result: void }

  // ---- 飞书交付 ----
  'feishu:test': { args: [cfg: FeishuConfig]; result: { ok: boolean; message: string } }
  'feishu:create-doc': { args: [articleId: string]; result: OpResult<{ url: string }> }

  // ---- 选题灵感库 ----
  'topic:list': { args: []; result: TopicIdea[] }
  'topic:insert': { args: [row: TopicIdea]; result: void }
  'topic:update': { args: [id: string, fields: Partial<TopicIdea>]; result: void }
  'topic:delete': { args: [id: string]; result: void }
}

/** 渲染端方法名 → invoke 通道名（preload 工厂与 window.api 类型的共同来源） */
export const apiMethods = {
  parseVideo: 'ytdlp:parse-video',
  searchVideos: 'ytdlp:search-videos',
  fetchVideoList: 'ytdlp:fetch-video-list',
  downloadVideo: 'ytdlp:download-video',
  cancelDownload: 'ytdlp:cancel-download',
  cancelParse: 'ytdlp:cancel-parse',
  detectYtdlp: 'ytdlp:detect',
  ytdlpUpdate: 'ytdlp:update',
  extractSubtitles: 'ytdlp:extract-subtitles',
  getDownloadsPath: 'app:get-downloads-path',
  showNotification: 'app:show-notification',
  openLogsFolder: 'app:open-logs-folder',
  openExternal: 'app:open-external',
  showItemInFolder: 'fs:show-item-in-folder',
  openFile: 'fs:open-file',
  readTextFile: 'fs:read-text-file',
  checkPaths: 'fs:check-paths',
  getDiskSpace: 'fs:get-disk-space',
  selectDirectory: 'fs:select-directory',
  selectFile: 'fs:select-file',
  dbGetCompletedRecords: 'db:get-completed-records',
  dbInsertCompletedRecord: 'db:insert-completed-record',
  dbDeleteCompletedRecord: 'db:delete-completed-record',
  dbUpdateCompletedRecordTags: 'db:update-completed-record-tags',
  dbGetFailedRecords: 'db:get-failed-records',
  dbInsertFailedRecord: 'db:insert-failed-record',
  dbDeleteFailedRecord: 'db:delete-failed-record',
  dbClearAllCompleted: 'db:clear-all-completed',
  dbClearAllFailed: 'db:clear-all-failed',
  settingsSync: 'settings:sync',
  openLoginWindow: 'cookies:open-login-window',
  ffmpegReady: 'ffmpeg:ready',
  extractFrames: 'ffmpeg:extract-frames',
  whisperReady: 'whisper:ready',
  transcribeVideo: 'whisper:transcribe',
  cancelTranscribe: 'whisper:cancel',
  subList: 'sub:list',
  subAdd: 'sub:add',
  subRemove: 'sub:remove',
  subToggle: 'sub:toggle',
  subSetGroup: 'sub:set-group',
  subSetPinned: 'sub:set-pinned',
  subCheck: 'sub:check',
  subCheckAll: 'sub:check-all',
  subListNewVideos: 'sub:new-videos',
  subDismissNewVideo: 'sub:dismiss',
  subClearNewVideos: 'sub:clear-new',
  subGrowthStats: 'sub:growth',
  testNetwork: 'net:test',
  getIpInfo: 'net:ip-info',
  ytApiTest: 'ytapi:test',
  ytApiGetQuota: 'ytapi:get-quota',
  llmTest: 'llm:test',
  llmAnalyzeTitle: 'llm:analyze-title',
  llmAnalyzeChannel: 'llm:analyze-channel',
  analysisGet: 'analysis:get',
  analysisKeys: 'analysis:keys',
  transcriptGet: 'transcript:get',
  transcriptOpening: 'transcript:opening',
  transcriptFetch: 'transcript:fetch',
  radarListKeywords: 'radar:list-keywords',
  radarAddKeywords: 'radar:add-keywords',
  radarRemoveKeyword: 'radar:remove-keyword',
  radarToggleKeyword: 'radar:toggle-keyword',
  radarStartScan: 'radar:start-scan',
  radarStopScan: 'radar:stop-scan',
  radarListChannels: 'radar:list-channels',
  radarRemoveChannel: 'radar:remove-channel',
  radarListRuns: 'radar:list-runs',
  distillStart: 'distill:start',
  distillRetry: 'distill:retry',
  distillCancel: 'distill:cancel',
  distillList: 'distill:list',
  distillGet: 'distill:get',
  distillDelete: 'distill:delete',
  feishuTest: 'feishu:test',
  feishuCreateDoc: 'feishu:create-doc',
  selectSavePath: 'fs:select-save-path',
  writeTextFile: 'fs:write-text-file',
  topicList: 'topic:list',
  topicInsert: 'topic:insert',
  topicUpdate: 'topic:update',
  topicDelete: 'topic:delete',
} as const satisfies Record<string, keyof IpcInvokeContract>

/** window.api 的 invoke 方法部分（由 apiMethods + IpcInvokeContract 派生） */
export type RendererApi = {
  [M in keyof typeof apiMethods]: (
    ...args: IpcInvokeContract[(typeof apiMethods)[M]]['args']
  ) => Promise<IpcInvokeContract[(typeof apiMethods)[M]]['result']>
}

/** 主进程 → 渲染端推送事件：channel → 载荷元组 */
export interface IpcEventContract {
  'event:download-progress': [progress: DownloadProgress]
  'event:transcribe-progress': [progress: TranscribeProgress]
  'event:cookies-path-updated': [filePath: string]
  'event:sub-scheduler-tick': [info: { totalNew: number }]
  'event:analysis-auto-done': [info: { channelId: string; channelName: string; videoId: string; videoTitle: string }]
  'event:radar-scan-progress': [progress: RadarScanProgress]
  'event:distill-progress': [progress: DistillProgress]
}

/** 渲染端事件订阅方法名 → 事件通道名 */
export const listenerMethods = {
  onDownloadProgress: 'event:download-progress',
  onTranscribeProgress: 'event:transcribe-progress',
  onCookiesPathUpdated: 'event:cookies-path-updated',
  onSubSchedulerTick: 'event:sub-scheduler-tick',
  onAnalysisAutoDone: 'event:analysis-auto-done',
  onRadarScanProgress: 'event:radar-scan-progress',
  onDistillProgress: 'event:distill-progress',
} as const satisfies Record<string, keyof IpcEventContract>

/** window.api 的事件订阅部分：注册回调，返回取消监听函数 */
export type RendererListeners = {
  [M in keyof typeof listenerMethods]: (
    callback: (...args: IpcEventContract[(typeof listenerMethods)[M]]) => void
  ) => () => void
}

/** 渲染端 → 主进程单向 send（窗口控制） */
export interface IpcSendContract {
  'window:minimize': []
  'window:maximize': []
  'window:close': []
}
