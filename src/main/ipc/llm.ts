import { handle } from './typed'
import { testLlm, analyzeTitle, analyzeChannel } from '../services/llm'
import { saveAnalysis } from '../services/autoAnalysis'
import { fetchTranscript, getCachedTranscript, getCachedOpeningText } from '../services/transcript'
import { testYoutubeApiKey } from '../services/youtubeApi'
import { getUsedToday, DAILY_LIMIT } from '../services/youtubeQuota'

export function registerLlmHandlers(): void {
  // ---- LLM（AI 分析）----
  handle('llm:test', async (_e, cfg) => testLlm(cfg))

  handle('llm:analyze-title', async (_e, cfg, input, save) => {
    try {
      const data = await analyzeTitle(cfg, input)
      // 带视频标识时把拆解结果入库（角标 + 复用缓存）
      if (save?.videoId) {
        saveAnalysis(save.videoId, save.channelId, input.title, data, !!input.openingText, false)
      }
      return { status: 'success' as const, data }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[llm] analyze title failed:', msg)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  handle('llm:analyze-channel', async (_e, cfg, input) => {
    try {
      const data = await analyzeChannel(cfg, input)
      return { status: 'success' as const, data }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[llm] analyze channel failed:', msg)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  // ---- YouTube Data API ----
  handle('ytapi:test', async (_e, key) => testYoutubeApiKey(key))
  handle('ytapi:get-quota', () => ({ used: getUsedToday(), limit: DAILY_LIMIT }))

  // ---- 视频文案（字幕提取入库）----
  handle('transcript:get', (_e, videoId, channelId) => {
    try {
      return getCachedTranscript(videoId, channelId)
    } catch {
      return null
    }
  })

  handle('transcript:opening', (_e, videoId, channelId, seconds) => {
    try {
      return getCachedOpeningText(videoId, channelId, seconds)
    } catch {
      return null
    }
  })

  handle('transcript:fetch', async (_e, video, force) => {
    try {
      const data = await fetchTranscript(video, force)
      return { status: 'success' as const, data }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })
}
