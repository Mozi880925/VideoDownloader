import { app, BrowserWindow } from 'electron'
import path from 'path'
import { registerAllIpc, registerWindowHandlers } from './ipc'
import { detectYtdlp, killAllActive } from './services/ytdlp'
import { killAllTranscribes } from './services/whisper'
import { stopScheduler } from './services/subscription'
import { initDb, closeDb } from './services/db'

const isDev = process.env.NODE_ENV === 'development'

// 窗口控制：模块级注册一次，避免 activate 重建窗口时监听器累积
registerWindowHandlers()

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
      // preload 需要 require 编译后的 shared/ipcContract（IPC 契约单一来源），
      // Electron 20+ 默认 sandbox 下 preload 无法 require 相对模块，故关闭。
      // 主窗口只加载本地内容（dev: localhost / prod: 本地文件），风险可控。
      sandbox: false,
    },
    frame: false,
    show: false,
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
  })
}

app.whenReady().then(async () => {
  // 初始化数据库
  initDb()

  // 注册全部 IPC handlers（按域拆分在 ipc/ 目录）
  registerAllIpc()

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
