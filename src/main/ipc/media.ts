import { handle, sendTo } from './typed'
import { extractFrames, ffmpegReady } from '../services/ffmpeg'
import { transcribeVideo, cancelTranscribe, whisperReady } from '../services/whisper'
import type { TaskResult, TranscribeResult } from '../../shared/types'

export function registerMediaHandlers(): void {
  // ---- 关键帧提取 ----
  handle('ffmpeg:ready', () => ffmpegReady())

  handle('ffmpeg:extract-frames', async (_event, options) => {
    try {
      const result = await extractFrames(options)
      return { status: 'success' as const, data: result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ffmpeg] extract frames failed:', msg)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  // ---- Whisper 转写 ----
  handle('whisper:ready', (_event, cfg) => whisperReady(cfg))

  handle('whisper:transcribe', async (event, options): Promise<TaskResult<TranscribeResult>> => {
    try {
      const result = await transcribeVideo(options, (p) => {
        sendTo(event.sender, 'event:transcribe-progress', p)
      })
      return { taskId: options.taskId, status: 'success', data: result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('[CANCELLED]')) {
        return { taskId: options.taskId, status: 'cancelled', errorMessage: msg }
      }
      return { taskId: options.taskId, status: 'failed', errorMessage: msg }
    }
  })

  handle('whisper:cancel', (_event, taskId) => cancelTranscribe(taskId))
}
