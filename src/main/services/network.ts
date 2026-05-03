import { net, session } from 'electron'
import type { NetworkTestResult, IpInfo, ProxyType } from '../../shared/types'

// ────────── 代理配置应用 ──────────

/**
 * 根据代理类型构建 yt-dlp 使用的代理 URL
 */
export function buildProxyUrl(type: ProxyType, host?: string, port?: string, username?: string, password?: string): string {
  if (type === 'none') return ''
  if (type === 'system') {
    return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
  }
  if (!host || !port) return ''
  const auth = username && password ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
  if (type === 'http') return `http://${auth}${host}:${port}`
  if (type === 'socks5') return `socks5://${auth}${host}:${port}`
  return ''
}

/**
 * 将代理设置应用到 Electron 默认 session
 */
export async function applySessionProxy(type: ProxyType, host?: string, port?: string): Promise<void> {
  const s = session.defaultSession
  if (type === 'none') {
    await s.setProxy({ mode: 'direct' })
  } else if (type === 'system') {
    await s.setProxy({ mode: 'system' })
  } else if (type === 'http' && host && port) {
    await s.setProxy({ proxyRules: `http=${host}:${port};https=${host}:${port}` })
  } else if (type === 'socks5' && host && port) {
    await s.setProxy({ proxyRules: `socks5=${host}:${port}` })
  }
}

// ────────── 网络连通性测试 ──────────

const TEST_SITES = [
  { name: 'YouTube',    url: 'https://www.youtube.com' },
  { name: 'Twitter/X',  url: 'https://twitter.com' },
  { name: 'Instagram',  url: 'https://www.instagram.com' },
  { name: 'TikTok',     url: 'https://www.tiktok.com' },
  { name: '抖音',        url: 'https://www.douyin.com' },
  { name: '小红书',      url: 'https://www.xiaohongshu.com' },
  { name: 'Bilibili',   url: 'https://www.bilibili.com' },
  { name: '百度',        url: 'https://www.baidu.com' },
]

async function testOneSite(site: { name: string; url: string }): Promise<NetworkTestResult> {
  return new Promise((resolve) => {
    const start = Date.now()
    const timer = setTimeout(() => {
      resolve({ name: site.name, url: site.url, success: false, latency: -1 })
    }, 10_000)

    try {
      const req = net.request({ url: site.url, method: 'HEAD' })
      req.on('response', (res) => {
        clearTimeout(timer)
        resolve({
          name: site.name,
          url: site.url,
          success: res.statusCode < 500,
          latency: Date.now() - start,
          statusCode: res.statusCode,
        })
      })
      req.on('error', () => {
        clearTimeout(timer)
        resolve({ name: site.name, url: site.url, success: false, latency: -1 })
      })
      req.end()
    } catch {
      clearTimeout(timer)
      resolve({ name: site.name, url: site.url, success: false, latency: -1 })
    }
  })
}

export async function testAllSites(): Promise<NetworkTestResult[]> {
  return Promise.all(TEST_SITES.map(testOneSite))
}

// ────────── IP 信息查询 ──────────

export async function getIpInfo(): Promise<IpInfo | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8_000)
    try {
      const req = net.request({ url: 'https://ipapi.co/json/', method: 'GET' })
      req.on('response', (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk.toString() })
        res.on('end', () => {
          clearTimeout(timer)
          try {
            const data = JSON.parse(body)
            resolve({
              ip: data.ip ?? '',
              city: data.city ?? '',
              region: data.region ?? '',
              country_name: data.country_name ?? '',
              country_code: data.country_code ?? '',
              org: data.org ?? '',
              asn: data.asn ?? '',
              timezone: data.timezone ?? '',
              latitude: data.latitude ?? 0,
              longitude: data.longitude ?? 0,
            })
          } catch {
            resolve(null)
          }
        })
      })
      req.on('error', () => { clearTimeout(timer); resolve(null) })
      req.end()
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}
