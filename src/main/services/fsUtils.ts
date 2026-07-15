import fs from 'fs'
import { execFile } from 'child_process'

/** 获取磁盘可用空间；优先 fs.statfs (Node 18+)，Windows 回退 wmic */
export async function getDiskSpace(dirPath: string): Promise<{ available: number; total: number }> {
  try {
    if ((fs as any).statfs) {
      const stat = await (fs.promises as any).statfs(dirPath)
      return { available: stat.bavail * stat.bsize, total: stat.blocks * stat.bsize }
    }
    // fallback: wmic logicaldisk
    const driveLetter = dirPath.slice(0, 2).toUpperCase()
    return await new Promise<{ available: number; total: number }>((resolve) => {
      execFile(
        'wmic',
        ['logicaldisk', 'where', `DeviceID="${driveLetter}"`, 'get', 'FreeSpace,Size', '/format:csv'],
        { timeout: 5000 },
        (_err, stdout) => {
          const lines = stdout.trim().split('\n').filter((l) => l.includes(','))
          const last = lines[lines.length - 1]?.split(',')
          if (last && last.length >= 3) {
            resolve({ available: parseInt(last[1].trim(), 10) || 0, total: parseInt(last[2].trim(), 10) || 0 })
          } else {
            resolve({ available: 0, total: 0 })
          }
        },
      )
    })
  } catch {
    return { available: 0, total: 0 }
  }
}
