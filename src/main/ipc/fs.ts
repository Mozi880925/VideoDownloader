import { app, shell, dialog, Notification, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { handle } from './typed'
import { getDiskSpace } from '../services/fsUtils'

export function registerFsHandlers(): void {
  // 获取系统下载目录
  handle('app:get-downloads-path', () => app.getPath('downloads'))

  // 发送系统通知
  handle('app:show-notification', (_event, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })

  // 打开日志文件夹
  handle('app:open-logs-folder', () => {
    const logDir = path.join(app.getPath('userData'), 'logs')
    shell.openPath(logDir)
  })

  // 用系统浏览器打开外部链接（仅允许 http/https）
  handle('app:open-external', (_event, url) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })

  // 在系统文件管理器中显示文件
  handle('fs:show-item-in-folder', (_event, filepath) => {
    shell.showItemInFolder(filepath)
  })

  // 用系统默认程序打开文件
  handle('fs:open-file', async (_event, filepath) => {
    const result = await shell.openPath(filepath)
    if (result) console.warn('[shell] openPath error:', result)
    return result
  })

  // 批量检测路径存在性 — 已完成列表渲染前用
  handle('fs:check-paths', async (_event, paths) => {
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

  // 读取文本文件内容（字幕查看器用）
  handle('fs:read-text-file', async (_event, filePath) => {
    return await fs.promises.readFile(filePath, 'utf-8')
  })

  // 获取磁盘可用空间（传入目标目录路径）
  handle('fs:get-disk-space', (_event, dirPath) => getDiskSpace(dirPath))

  // 选择目录
  handle('fs:select-directory', async (event, defaultPath) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showOpenDialog(win, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return undefined
  })

  // 选择文件
  handle('fs:select-file', async (event, filters) => {
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

  // 选择保存路径（另存为对话框）
  handle('fs:select-save-path', async (event, defaultFileName, filters) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultFileName,
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    if (!result.canceled && result.filePath) {
      return result.filePath
    }
    return undefined
  })

  // 写文本文件（自动创建父目录）
  handle('fs:write-text-file', async (_event, filePath, content) => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, content, 'utf-8')
  })
}
