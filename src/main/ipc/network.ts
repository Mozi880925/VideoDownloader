import { handle } from './typed'
import { testAllSites, getIpInfo } from '../services/network'

export function registerNetworkHandlers(): void {
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
