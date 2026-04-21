import { contextBridge, ipcRenderer } from 'electron'
import type { DownloadOptions, DownloadProgress, VideoInfo, YtdlpInfo, SearchResult } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
})

contextBridge.exposeInMainWorld('api', {
  /** 解析视频信息 */
  parseVideo: (url: string, proxy?: string): Promise<VideoInfo> =>
    ipcRenderer.invoke('parse-video', url, proxy),

  /** 搜索素材视频 */
  searchVideos: (keyword: string, limit?: number, proxy?: string): Promise<SearchResult[]> =>
    ipcRenderer.invoke('search-videos', keyword, limit, proxy),

  /** 开始下载（resolve 返回最终文件路径，reject 表示失败） */
  downloadVideo: (options: DownloadOptions): Promise<string | undefined> =>
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

  /** 获取系统下载目录 */
  getDownloadsPath: (): Promise<string> => ipcRenderer.invoke('get-downloads-path'),

  /** 在系统文件管理器中显示文件 */
  showItemInFolder: (filepath: string): Promise<void> =>
    ipcRenderer.invoke('show-item-in-folder', filepath),

  /** 用系统默认程序打开文件 */
  openFile: (filepath: string): Promise<string> =>
    ipcRenderer.invoke('open-file', filepath),

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
})
