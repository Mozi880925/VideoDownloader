import { exec, type spawn } from 'child_process'

/**
 * 杀死进程树（Windows 使用 taskkill /T /F，其他平台使用 negative PID）
 * ytdlp / whisper 等所有子进程管理共用的唯一实现。
 */
export function killProcessTree(proc: ReturnType<typeof spawn>): void {
  const pid = proc.pid
  if (!pid) {
    proc.kill()
    return
  }

  if (process.platform === 'win32') {
    // taskkill /T = kill process tree, /F = force
    exec(`taskkill /T /F /PID ${pid}`, (err) => {
      if (err) {
        console.warn('[process] taskkill failed, fallback to proc.kill():', err.message)
        try { proc.kill() } catch {}
      }
    })
  } else {
    // Unix: kill process group
    try { process.kill(-pid, 'SIGTERM') } catch {
      try { proc.kill() } catch {}
    }
  }
}
