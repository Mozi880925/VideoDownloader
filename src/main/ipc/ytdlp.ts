import { handle } from './typed'
import { detectYtdlp, cancelParse, fetchVideoList, extractSubtitles } from '../services/ytdlp'
import type { SubtitleExtractResult } from '../../shared/ipcContract'

export function registerYtdlpHandlers(): void {
  // 检测 yt-dlp 可用性
  handle('ytdlp:detect', () => detectYtdlp())

  // 取消解析
  handle('ytdlp:cancel-parse', (_event, taskId) => cancelParse(taskId))

  // 拉取频道/播放列表的视频列表
  handle('ytdlp:fetch-video-list', async (_event, url, limit, proxy) => {
    try {
      const data = await fetchVideoList(url, limit ?? 30, proxy)
      return { status: 'success' as const, data }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  // 字幕提取（使用 yt-dlp 仅下载字幕）
  handle('ytdlp:extract-subtitles', async (_event, url, outputDir, langs) => {
    try {
      return (await extractSubtitles(url, outputDir, langs)) as SubtitleExtractResult
    } catch (err) {
      console.error('[ytdlp] extract subtitles failed:', err)
      return { status: 'failed' as const, errorMessage: String(err) }
    }
  })
}
