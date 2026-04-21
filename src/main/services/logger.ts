import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// 日志目录与文件
const logDir = path.join(app.getPath('userData'), 'logs')
const logFile = path.join(logDir, 'vdownload.log')

// 确保目录存在（启动时同步创建一次）
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
} catch (err) {
  console.error('[logger] Failed to create log directory:', err)
}

function getTimestamp() {
  return new Date().toISOString()
}

/**
 * 记录普通信息日志
 */
export function logInfo(message: string, ...args: unknown[]) {
  const line = `[INFO] ${getTimestamp()} ${message} ${args.length ? JSON.stringify(args) : ''}\n`
  console.log(line.trim())
  fs.appendFile(logFile, line, (err) => {
    if (err) console.error('[logger] appendFile error:', err)
  })
}

/**
 * 记录错误日志
 */
export function logError(message: string, error?: unknown) {
  let errStr = ''
  if (error instanceof Error) {
    errStr = ` \n  ${error.message}\n  ${error.stack}`
  } else if (error) {
    errStr = ` \n  ${JSON.stringify(error)}`
  }
  
  const line = `[ERROR] ${getTimestamp()} ${message}${errStr}\n`
  console.error(line.trim())
  fs.appendFile(logFile, line, (err) => {
    if (err) console.error('[logger] appendFile error:', err)
  })
}
