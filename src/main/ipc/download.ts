import { ipcMain, BrowserWindow } from 'electron'
import { parseVideo, downloadVideo, cancelDownload, searchVideos } from '../services/ytdlp'
import type { DownloadOptions, VideoInfo, SearchResult, TaskResult } from '../../shared/types'

// 将 Error.message 分类为 TaskStatus
function classifyError(msg: string): TaskResult<never>['status'] {
  if (msg.includes('[CANCELLED]')) return 'cancelled'
  if (msg.includes('超时') || msg.toLowerCase().includes('timeout')) return 'timeout'
  return 'failed'
}

export function registerDownloadHandlers(): void {
  // 解析视频信息 — 始终 resolve TaskResult，不再 reject
  ipcMain.handle('parse-video', async (_event, url: string, proxy?: string): Promise<TaskResult<VideoInfo>> => {
    try {
      const info = await parseVideo(url, proxy)
      return { taskId: '', status: 'success', data: info }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { taskId: '', status: classifyError(msg), errorMessage: msg }
    }
  })

  // 搜索视频 — 始终 resolve TaskResult
  ipcMain.handle('search-videos', async (_event, keyword: string, limit?: number, proxy?: string): Promise<TaskResult<SearchResult[]>> => {
    try {
      const results = await searchVideos(keyword, limit, proxy)
      return { taskId: '', status: 'success', data: results }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { taskId: '', status: classifyError(msg), errorMessage: msg }
    }
  })

  // 开始下载 — 始终 resolve TaskResult，不再 reject
  ipcMain.handle('download-video', async (event, options: DownloadOptions): Promise<TaskResult<string>> => {
    return new Promise<TaskResult<string>>((resolve) => {
      downloadVideo(
        options,
        (progress) => {
          const win = BrowserWindow.fromWebContents(event.sender)
          win?.webContents.send('download-progress', progress)
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

  // 取消下载（不涉及结果结构，保持原样）
  ipcMain.handle('cancel-download', async (_event, taskId: string) => {
    return cancelDownload(taskId)
  })
}
