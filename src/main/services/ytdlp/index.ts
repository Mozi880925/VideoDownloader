// ────────── ytdlp 模块统一出口（外部 import '../services/ytdlp' 路径不变）──────────

export { setCookiesPath, setDouyinCookiesBrowser, setDomesticCookiesPath, setProxyUrl, isDomesticPlatform } from './config'
export { cancelParse, cancelDownload, killAllActive } from './registry'
export { detectYtdlp, parseVideo, searchVideos, updateYtdlp } from './parse'
export { downloadVideo } from './download'
export { fetchVideoList } from './playlist'
export { extractSubtitles, type ExtractSubtitlesResult } from './subtitles'
