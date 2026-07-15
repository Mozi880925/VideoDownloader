import { parseVideo, downloadVideo, cancelDownload, searchVideos, updateYtdlp } from '../services/ytdlp'
import type { TaskResult } from '../../shared/types'
import { handle, sendTo } from './typed'

// 将 Error.message 分类为 TaskStatus
function classifyError(msg: string): TaskResult<never>['status'] {
  if (msg.includes('[CANCELLED]')) return 'cancelled'
  if (msg.includes('超时') || msg.toLowerCase().includes('timeout')) return 'timeout'
  return 'failed'
}

export function registerDownloadHandlers(): void {
  // 解析视频信息 — 始终 resolve TaskResult，不再 reject
  handle('ytdlp:parse-video', async (_event, url, proxy, taskId) => {
    try {
      const info = await parseVideo(url, proxy, taskId)
      return { taskId: taskId ?? '', status: 'success', data: info }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { taskId: taskId ?? '', status: classifyError(msg), errorMessage: msg }
    }
  })

  // 搜索视频 — 始终 resolve TaskResult
  handle('ytdlp:search-videos', async (_event, keyword, limit, proxy) => {
    try {
      const results = await searchVideos(keyword, limit, proxy)
      return { taskId: '', status: 'success', data: results }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { taskId: '', status: classifyError(msg), errorMessage: msg }
    }
  })

  // 开始下载 — 始终 resolve TaskResult，不再 reject
  handle('ytdlp:download-video', async (event, options) => {
    return new Promise<TaskResult<string>>((resolve) => {
      downloadVideo(
        options,
        (progress) => {
          sendTo(event.sender, 'event:download-progress', progress)
        },
        (err, filepath) => {
          if (err) {
            const msg = err.message
            resolve({ taskId: options.taskId, status: classifyError(msg), errorMessage: msg })
          } else {
            resolve({ taskId: options.taskId, status: 'success', data: filepath })
          }
        },
      )
    })
  })

  // 取消下载
  handle('ytdlp:cancel-download', async (_event, taskId) => {
    return cancelDownload(taskId)
  })

  // 更新 yt-dlp
  handle('ytdlp:update', async () => {
    return updateYtdlp()
  })
}
