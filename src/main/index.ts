import { app, BrowserWindow, ipcMain, shell, dialog, Notification, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerDownloadHandlers } from './ipc/download'
import { detectYtdlp, cancelParse, killAllActive, setCookiesPath, getYtdlpPathPublic, fetchVideoList } from './services/ytdlp'
import { extractFrames, ffmpegReady } from './services/ffmpeg'
import { transcribeVideo, cancelTranscribe, killAllTranscribes, whisperReady } from './services/whisper'
import {
  addSubscription,
  listSubscriptions,
  removeSubscription,
  toggleSubscription,
  setSubscriptionGroup,
  setSubscriptionPinned,
  checkSubscription,
  checkAllSubscriptions,
  listNewVideos,
  dismissNewVideo,
  clearNewVideos,
  setYtdlpPathGetter as setSubYtdlpPathGetter,
  startScheduler,
  stopScheduler,
} from './services/subscription'
import type { FrameExtractOptions, TranscribeOptions, WhisperConfig, TaskResult, TranscribeResult, CheckInterval, NewVideoItem } from '../shared/types'
import {
  initDb,
  closeDb,
  getAllCompletedRecords,
  insertCompletedRecord,
  updateCompletedRecordTags,
  deleteCompletedRecord,
  clearAllCompletedRecords,
  getAllFailedRecords,
  insertFailedRecord,
  deleteFailedRecord,
  clearAllFailedRecords,
  type CompletedRecordRow,
  type FailedRecordRow,
} from './services/db'

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    show: false,
  })

  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => win.close())

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
  })
}

app.whenReady().then(async () => {
  // 初始化数据库
  initDb()

  // 注册 IPC handlers
  registerDownloadHandlers()

  // detect-ytdlp handler
  ipcMain.handle('detect-ytdlp', () => detectYtdlp())

  // 取消解析
  ipcMain.handle('cancel-parse', (_event, taskId: string) => cancelParse(taskId))

  // 拉取频道/播放列表的视频列表
  ipcMain.handle('ytdlp:fetch-video-list', async (_event, url: string, limit?: number, proxy?: string) => {
    try {
      const data = await fetchVideoList(url, limit ?? 30, proxy)
      return { status: 'success' as const, data }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  // 获取系统下载目录
  ipcMain.handle('get-downloads-path', () => app.getPath('downloads'))

  // 在系统文件管理器中显示文件
  ipcMain.handle('show-item-in-folder', (_event, filepath: string) => {
    shell.showItemInFolder(filepath)
  })

  // 用系统默认程序打开文件
  ipcMain.handle('open-file', async (_event, filepath: string) => {
    const result = await shell.openPath(filepath)
    if (result) console.warn('[shell] openPath error:', result)
    return result
  })

  // 批量检测路径存在性 — 已完成列表渲染前用
  ipcMain.handle('fs:check-paths', async (_event, paths: string[]) => {
    const result: Record<string, boolean> = {}
    if (!Array.isArray(paths)) return result
    for (const p of paths) {
      if (typeof p !== 'string' || !p) {
        result[p] = false
        continue
      }
      try {
        result[p] = fs.existsSync(p)
      } catch {
        result[p] = false
      }
    }
    return result
  })

  // ---- 数据库 IPC ----
  ipcMain.handle('db:get-completed-records', () => {
    try {
      return getAllCompletedRecords()
    } catch (err) {
      console.error('[db] get completed records failed:', err)
      return []
    }
  })

  ipcMain.handle('db:insert-completed-record', (_event, record: CompletedRecordRow) => {
    try {
      insertCompletedRecord(record)
    } catch (err) {
      console.error('[db] insert completed record failed:', err)
    }
  })

  ipcMain.handle('db:delete-completed-record', (_event, id: string) => {
    try {
      deleteCompletedRecord(id)
    } catch (err) {
      console.error('[db] delete completed record failed:', err)
    }
  })

  ipcMain.handle('db:update-completed-record-tags', (_event, id: string, tags: string) => {
    try {
      updateCompletedRecordTags(id, tags)
    } catch (err) {
      console.error('[db] update record tags failed:', err)
    }
  })

  ipcMain.handle('db:get-failed-records', () => {
    try {
      return getAllFailedRecords()
    } catch (err) {
      console.error('[db] get failed records failed:', err)
      return []
    }
  })

  ipcMain.handle('db:insert-failed-record', (_event, record: FailedRecordRow) => {
    try {
      insertFailedRecord(record)
    } catch (err) {
      console.error('[db] insert failed record failed:', err)
    }
  })

  ipcMain.handle('db:delete-failed-record', (_event, id: string) => {
    try {
      deleteFailedRecord(id)
    } catch (err) {
      console.error('[db] delete failed record failed:', err)
    }
  })

  ipcMain.handle('db:clear-all-completed', () => {
    try {
      return clearAllCompletedRecords()
    } catch (err) {
      console.error('[db] clear all completed failed:', err)
      return 0
    }
  })

  ipcMain.handle('db:clear-all-failed', () => {
    try {
      return clearAllFailedRecords()
    } catch (err) {
      console.error('[db] clear all failed failed:', err)
      return 0
    }
  })

  // ---- Wrap-up Features ----
  ipcMain.handle('select-directory', async (event, defaultPath?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return undefined
  })

  ipcMain.handle('select-file', async (event, filters?: Electron.FileFilter[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return undefined
  })

  ipcMain.handle('set-cookies-path', (_event, filePath: string) => {
    setCookiesPath(filePath)
  })

  // ---- YouTube 应用内登录 ----
  let loginWindow: BrowserWindow | null = null

  ipcMain.handle('open-login-window', (event) => {
    // 已经打开则聚焦，不重复创建
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus()
      return
    }

    loginWindow = new BrowserWindow({
      width: 900,
      height: 700,
      title: '登录 YouTube',
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:youtube-login',
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    loginWindow.loadURL('https://accounts.google.com/signin/v2/identifier?service=youtube')

    // 登录成功后 Google 会跳转到 youtube.com，等 2 秒让 cookie 落地后自动关窗
    loginWindow.webContents.on('did-navigate', (_e, url) => {
      if (url.includes('youtube.com') && !url.includes('accounts.google.com')) {
        setTimeout(() => {
          if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close()
        }, 2000)
      }
    })

    loginWindow.on('closed', async () => {
      loginWindow = null
      try {
        const loginSession = session.fromPartition('persist:youtube-login')
        const cookies = await loginSession.cookies.get({})

        // 只保留 youtube / google 相关 cookie
        const targetCookies = cookies.filter((c) => {
          const d = (c.domain || '').toLowerCase()
          return d.includes('youtube.com') || d.includes('google.com')
        })

        // Netscape cookies.txt 格式：
        // domain \t include_subdomains \t path \t secure \t expiry \t name \t value
        const lines: string[] = [
          '# Netscape HTTP Cookie File',
          '# Generated by VideoDownloader',
          '',
        ]
        for (const c of targetCookies) {
          const domain = c.domain || ''
          const includeSub = domain.startsWith('.') ? 'TRUE' : 'FALSE'
          const cookiePath = c.path || '/'
          const secure = c.secure ? 'TRUE' : 'FALSE'
          const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0
          lines.push(`${domain}\t${includeSub}\t${cookiePath}\t${secure}\t${expiry}\t${c.name}\t${c.value}`)
        }

        const cookiesFilePath = path.join(app.getPath('userData'), 'youtube-cookies.txt')
        fs.writeFileSync(cookiesFilePath, lines.join('\n'), 'utf-8')

        // 同步到主进程 ytdlp 缓存 + 通知渲染进程更新 settings
        setCookiesPath(cookiesFilePath)
        if (!event.sender.isDestroyed()) {
          event.sender.send('cookies-path-updated', cookiesFilePath)
        }

        console.log(`[login] exported ${targetCookies.length} cookies → ${cookiesFilePath}`)
      } catch (err) {
        console.error('[login] cookie export failed:', err)
      }
    })
  })

  ipcMain.handle('show-notification', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })

  ipcMain.handle('open-logs-folder', () => {
    const logDir = path.join(app.getPath('userData'), 'logs')
    shell.openPath(logDir)
  })

  // ---- 关键帧提取 ----
  ipcMain.handle('ffmpeg:ready', () => ffmpegReady())

  ipcMain.handle('ffmpeg:extract-frames', async (_event, options: FrameExtractOptions) => {
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
  ipcMain.handle('whisper:ready', (_event, cfg: WhisperConfig | undefined) => whisperReady(cfg))

  ipcMain.handle('whisper:transcribe', async (event, options: TranscribeOptions): Promise<TaskResult<TranscribeResult>> => {
    try {
      const result = await transcribeVideo(options, (p) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.webContents.send('transcribe-progress', p)
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

  ipcMain.handle('whisper:cancel', (_event, taskId: string) => cancelTranscribe(taskId))

  // ---- 频道订阅 ----
  setSubYtdlpPathGetter(() => getYtdlpPathPublic())

  ipcMain.handle('sub:list', () => {
    try { return listSubscriptions() } catch (err) {
      console.error('[sub] list failed:', err); return []
    }
  })

  ipcMain.handle('sub:add', async (_event, url: string, customName?: string) => {
    try {
      const sub = await addSubscription(url, customName)
      return { status: 'success' as const, data: sub }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  ipcMain.handle('sub:remove', (_event, id: string) => {
    try { removeSubscription(id) } catch (err) { console.error('[sub] remove failed:', err) }
  })

  ipcMain.handle('sub:toggle', (_event, id: string, enabled: boolean) => {
    try { toggleSubscription(id, enabled) } catch (err) { console.error('[sub] toggle failed:', err) }
  })

  ipcMain.handle('sub:set-group', (_event, id: string, groupName: string) => {
    try { setSubscriptionGroup(id, groupName) } catch (err) { console.error('[sub] set-group failed:', err) }
  })

  ipcMain.handle('sub:set-pinned', (_event, id: string, pinned: boolean) => {
    try { setSubscriptionPinned(id, pinned) } catch (err) { console.error('[sub] set-pinned failed:', err) }
  })

  ipcMain.handle('sub:check', async (event, id: string) => {
    try {
      const newVideos = await checkSubscription(id)
      // 桌面通知
      if (newVideos.length > 0 && Notification.isSupported()) {
        const sub = listSubscriptions().find((s) => s.id === id)
        new Notification({
          title: `${sub?.name ?? '订阅'} 有 ${newVideos.length} 个新视频`,
          body: newVideos.slice(0, 3).map((v) => v.title).join('  ·  '),
        }).show()
      }
      return { status: 'success' as const, data: newVideos }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { status: 'failed' as const, errorMessage: msg }
    }
  })

  ipcMain.handle('sub:check-all', async (event) => {
    const allNew: { subId: string; subName: string; newVideos: NewVideoItem[]; err?: string }[] = []
    await checkAllSubscriptions((subId, subName, newVideos, err) => {
      allNew.push({ subId, subName, newVideos, err: err?.message })
    })
    const totalNew = allNew.reduce((sum, x) => sum + x.newVideos.length, 0)
    if (totalNew > 0 && Notification.isSupported()) {
      new Notification({
        title: `订阅检查完成：${totalNew} 个新视频`,
        body: allNew.filter((x) => x.newVideos.length > 0).slice(0, 3)
          .map((x) => `${x.subName}：${x.newVideos.length} 个`).join('  ·  '),
      }).show()
    }
    if (!event.sender.isDestroyed()) {
      event.sender.send('sub:check-finished', { totalNew })
    }
    return allNew
  })

  ipcMain.handle('sub:new-videos', (_event, channelId?: string) => {
    try { return listNewVideos(channelId) } catch (err) {
      console.error('[sub] list new videos failed:', err); return []
    }
  })

  ipcMain.handle('sub:dismiss', (_event, videoId: string, channelId: string) => {
    try { dismissNewVideo(videoId, channelId) } catch (err) { console.error('[sub] dismiss failed:', err) }
  })

  ipcMain.handle('sub:clear-new', (_event, channelId: string) => {
    try { return clearNewVideos(channelId) } catch (err) {
      console.error('[sub] clear new failed:', err); return 0
    }
  })

  ipcMain.handle('sub:set-interval', (event, interval: CheckInterval) => {
    startScheduler(interval, (results) => {
      const totalNew = results.reduce((sum, r) => sum + r.newVideos.length, 0)
      if (totalNew > 0 && Notification.isSupported()) {
        new Notification({
          title: `定时检查：发现 ${totalNew} 个新视频`,
          body: results.filter((r) => r.newVideos.length > 0).slice(0, 3)
            .map((r) => `${r.subName}：${r.newVideos.length} 个`).join('  ·  '),
        }).show()
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send('sub:scheduler-tick', { totalNew })
      }
    })
  })

  // 启动自检：检测 yt-dlp 是否可用
  const info = await detectYtdlp()
  if (info.available) {
    console.log(`[ytdlp] ✓ 检测到 yt-dlp：路径=${info.path}，版本=${info.version}`)
  } else {
    console.warn('[ytdlp] ✗ 未检测到 yt-dlp，请先安装并确保其在 PATH 中')
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  killAllActive()
  killAllTranscribes()
  stopScheduler()
  closeDb()
})

