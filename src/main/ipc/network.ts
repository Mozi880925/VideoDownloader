import { handle } from './typed'
import { applySessionProxy, buildProxyUrl, testAllSites, getIpInfo } from '../services/network'
import { setProxyUrl } from '../services/ytdlp'
import type { ProxyType } from '../../shared/types'

export function registerNetworkHandlers(): void {
  // 代理设置（同步到 Electron session 和 yt-dlp）
  handle('net:set-proxy', async (_event, type, host, port, username, password) => {
    try {
      const proxyUrl = buildProxyUrl(type as ProxyType, host, port, username, password)
      setProxyUrl(proxyUrl)
      await applySessionProxy(type as ProxyType, host, port)
      console.log(`[proxy] applied type=${type} url=${proxyUrl || '(none)'}`)
    } catch (err) {
      console.error('[proxy] apply failed:', err)
    }
  })

  // 网络连通性测试
  handle('net:test', async () => {
    try {
      return await testAllSites()
    } catch (err) {
      console.error('[network] test failed:', err)
      return []
    }
  })

  // IP 信息
  handle('net:ip-info', async () => {
    try {
      return await getIpInfo()
    } catch (err) {
      console.error('[network] get ip info failed:', err)
      return null
    }
  })
}
