import fs from 'fs'
import { logInfo } from '../logger'
import { getJsRuntime } from '../toolPaths'

// ────────── yt-dlp 运行时配置（渲染端启动 / 改设置时经 IPC 推送）──────────

let cachedCookiesPath = ''

export function setCookiesPath(filePath: string): void {
  cachedCookiesPath = filePath
  logInfo(`[ytdlp] cookies path updated: ${filePath || '(none)'}`)
}

// ────────── Douyin browser cookies (抖音需要新鲜 Cookie，直接读浏览器) ──────────

let cachedDouyinBrowser = 'chrome'  // 默认 Chrome

export function setDouyinCookiesBrowser(browser: string): void {
  cachedDouyinBrowser = browser
  logInfo(`[ytdlp] douyin cookies browser: ${browser || '(none)'}`)
}

// ────────── 国内平台独立 Cookies 文件（解决 Chrome 运行时锁 cookie DB 问题）──────────

let cachedDomesticCookiesPath = ''

export function setDomesticCookiesPath(filePath: string): void {
  cachedDomesticCookiesPath = filePath
  logInfo(`[ytdlp] domestic cookies path updated: ${filePath || '(none)'}`)
}

/** 判断 URL 是否需要浏览器 Cookie（抖音/小红书等国内平台） */
export function isDomesticPlatform(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'douyin.com' ||
           hostname.endsWith('.douyin.com') ||
           hostname === 'iesdouyin.com' ||
           hostname.endsWith('.iesdouyin.com') ||
           hostname === 'xiaohongshu.com' ||
           hostname.endsWith('.xiaohongshu.com') ||
           hostname === 'xhslink.com'
  } catch {
    return false
  }
}

// ────────── Proxy URL (set by renderer via IPC on startup / settings change) ──────────

let cachedProxyUrl = ''

export function setProxyUrl(url: string): void {
  cachedProxyUrl = url
  logInfo(`[ytdlp] proxy url updated: ${url || '(none)'}`)
}

// ────────── Shared base args ──────────

export function buildBaseArgs(proxy?: string, targetUrl?: string): string[] {
  const args: string[] = ['--no-warnings']

  // 显式传入的 proxy 优先；否则用全局缓存值
  const effectiveProxy = proxy || cachedProxyUrl
  if (effectiveProxy) args.push('--proxy', effectiveProxy)

  const js = getJsRuntime()
  if (js) args.push('--js-runtimes', `${js.kind}:${js.path}`)
  else console.warn('[ytdlp] No JS runtime found — YouTube n-challenge may fail')

  // 抖音、小红书需要 Cookie；优先用独立文件（最稳定），否则读浏览器
  if (targetUrl && isDomesticPlatform(targetUrl)) {
    if (cachedDomesticCookiesPath && fs.existsSync(cachedDomesticCookiesPath)) {
      args.push('--cookies', cachedDomesticCookiesPath)
    } else if (cachedDouyinBrowser && cachedDouyinBrowser !== 'none') {
      args.push('--cookies-from-browser', cachedDouyinBrowser)
    }
  } else if (cachedCookiesPath && fs.existsSync(cachedCookiesPath)) {
    args.push('--cookies', cachedCookiesPath)
  }

  return args
}
