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

// ────────── LLM（OpenAI 兼容 API）──────────

export interface LlmConfig {
  baseUrl: string   // 例：https://api.deepseek.com/v1
  apiKey: string
  model: string     // 例：deepseek-chat
}

/** 标题拆解的输入：目标视频 + 同频道近期视频做对照 */
export interface TitleAnalysisInput {
  title: string
  viewCount?: number
  channelName?: string
  siblings: { title: string; viewCount?: number }[]
  openingText?: string    // 视频开头文案（前 90 秒字幕），提供时额外做钩子拆解
}

/** LLM 输出的结构化拆解结果 */
export interface TitleAnalysis {
  structure: string       // 标题结构拆解
  hooks: string[]         // 使用的钩子/技巧
  emotion: string         // 情绪触发点
  templates: string[]     // 可复用的标题模板
  suggestions: string[]   // 给用户的选题建议
  opening?: string        // 开头钩子拆解（仅当提供了开头文案）
}

/** 频道级标题规律分析的输入 */
export interface ChannelAnalysisInput {
  channelName: string
  videos: { title: string; viewCount?: number; uploadDate?: string }[]
}

/** LLM 输出的频道标题规律报告 */
export interface ChannelAnalysis {
  formula: string         // 该频道的标题公式总结
  patterns: string[]      // 高播放标题的共性规律
  weaknesses: string      // 低播放标题的常见问题
  templates: string[]     // 可复用的标题模板
  suggestions: string[]   // 给用户的选题建议
}

export interface ChannelAnalysisResult {
  raw: string
  parsed?: ChannelAnalysis
}

/** 已持久化的单视频拆解记录 */
export interface VideoAnalysisRecord {
  videoId: string
  channelId: string
  title: string
  result: TitleAnalysisResult
  usedOpening: boolean
  auto: boolean           // 是否由爆款自动触发
  createdAt: number
}

/** 视频文案（从字幕提取的纯文本） */
export interface VideoTranscript {
  videoId: string
  channelId: string
  url: string
  title: string
  language: string
  text: string
  createdAt: number
}

export interface TitleAnalysisResult {
  raw: string             // LLM 原始回复（解析失败时兜底展示）
  parsed?: TitleAnalysis
}

export type ProxyType = 'none' | 'system' | 'http' | 'socks5'

export interface NetworkTestResult {
  name: string
  url: string
  success: boolean
  latency: number   // ms，-1 = 超时/失败
  statusCode?: number
}

export interface IpInfo {
  ip: string
  city: string
  region: string
  country_name: string
  country_code: string   // 'US' / 'CN' ...
  org: string            // 'AS3257 Gtt Communications Inc.'
  asn: string
  timezone: string
  latitude: number
  longitude: number
}

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
  proxyType?: ProxyType            // 默认 'none'
  proxyHost?: string
  proxyPort?: string
  proxyUsername?: string
  proxyPassword?: string
  douyinCookiesBrowser?: string    // 浏览器 Cookie 来源（抖音/小红书等国内平台），默认 'chrome'
  domesticCookiesPath?: string     // 国内平台独立 cookies 文件，优先级高于浏览器读取（解决 Chrome 运行时锁文件问题）
  llm?: LlmConfig                  // AI 分析用的 OpenAI 兼容 API 配置
  autoAnalyzeHot?: boolean         // 检查订阅时自动 AI 拆解爆款新视频，默认 false
  youtubeApiKey?: string           // YouTube Data API v3 Key，配置后订阅检查改走官方 API（精确播放量）
}

/** 视频播放量增速（基于快照计算的日增） */
export interface VideoGrowthStat {
  videoId: string
  channelId: string
  growth24h: number    // 按最近快照折算的 24 小时播放量增长
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
  viewCount?: number
  discoveredAt: number
  status: 'new' | 'dismissed' | 'seen'
}

// ────────── 选题灵感库 ──────────

export type TopicStatus = 'pending' | 'planned' | 'filming' | 'published'

export interface TopicIdea {
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

// ────────── 下载记录（domain 类型，跨 IPC 传输；snake_case 行映射在主进程 db 层完成）──────────

export interface CompletedRecord {
  taskId: string
  url: string
  title: string
  thumbnail: string
  platform: string
  filepath: string
  completedAt: number
  tags: string[]
}

export interface FailedRecord {
  taskId: string
  url: string
  title: string
  thumbnail: string
  platform: string
  errorMessage: string
  failedAt: number
}

// ────────── 蓝海雷达 ──────────

export interface RadarKeyword {
  id: string
  keyword: string
  enabled: boolean
  createdAt: number
  lastScannedAt: number   // 0 = 从未扫描
}

export interface RadarChannel {
  channelId: string
  title: string
  thumbnail: string
  customUrl: string        // @handle，可能为空
  country: string          // ISO 国家码，可能为空
  publishedAt: string      // ISO 建号时间
  subscriberCount: number
  videoCount: number
  viewCount: number
  firstSeenAt: number      // 首次被雷达发现的时间戳
  lastUpdatedAt: number    // 最近一次详情刷新时间戳
  sourceKeyword: string    // 首次发现它的关键词
  // ── 派生指标（主进程查询时计算）──
  ageMonths: number        // 频道月龄（建号至今，保留 1 位小数）
  subsPerMonth: number     // 月均吸粉 = 订阅数 / max(1, 月龄)
}

export interface RadarScanRun {
  id: string
  startedAt: number
  finishedAt: number       // 0 = 进行中
  keywordsScanned: number
  channelsFound: number    // 本次触达的频道数（含已知）
  newChannels: number      // 本次新入库的频道数
  quotaSpent: number       // 本次消耗的配额单位
  status: 'running' | 'done' | 'stopped' | 'failed'
  errorMessage: string
}

/** 扫描进度事件载荷 */
export interface RadarScanProgress {
  runId: string
  stage: 'scanning' | 'done' | 'stopped' | 'failed'
  currentKeyword: string
  keywordIndex: number     // 当前是第几个关键词（1-based）
  keywordTotal: number
  channelsFound: number
  newChannels: number
  quotaSpent: number
  message?: string         // stopped/failed 时的说明
}

export type TaskStatus = 'success' | 'failed' | 'timeout' | 'cancelled' | 'cookie_error'

export interface TaskResult<T = unknown> {
  taskId: string
  status: TaskStatus
  data?: T
  errorMessage?: string
}
