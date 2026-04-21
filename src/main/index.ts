import { app, BrowserWindow, ipcMain, shell, dialog, Notification, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerDownloadHandlers } from './ipc/download'
import { detectYtdlp, cancelParse, killAllActive, setCookiesPath } from './services/ytdlp'
import {
  initDb,
  closeDb,
  getAllCompletedRecords,
  insertCompletedRecord,
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
  closeDb()
})

