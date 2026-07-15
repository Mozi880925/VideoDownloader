import { Notification } from 'electron'
import { handle, sendToAll } from './typed'
import { applySettings, onSettings } from '../services/settingsHub'
import { setCookiesPath, setDouyinCookiesBrowser, setDomesticCookiesPath, setProxyUrl } from '../services/ytdlp'
import { applySessionProxy, buildProxyUrl } from '../services/network'
import { setLlmRuntimeConfig } from '../services/llm'
import { setAutoAnalyzeEnabled } from '../services/autoAnalysis'
import { setYoutubeApiKey } from '../services/youtubeApi'
import { startScheduler } from '../services/subscription'

export function registerSettingsHandlers(): void {
  handle('settings:sync', (_e, settings) => {
    applySettings(settings)
  })
}

/**
 * 集中注册全部设置消费方（whenReady 时调用一次）。
 * 收到首次 settings:sync 前各 service 保持默认值；订阅调度器也等首次推送才启动，
 * 与旧行为（渲染端挂载后逐项 push）一致。
 */
export function bootstrapSettingsConsumers(): void {
  onSettings((s) => {
    // cookies
    setCookiesPath(s.cookiesPath ?? '')
    setDouyinCookiesBrowser(s.douyinCookiesBrowser || 'chrome')
    setDomesticCookiesPath(s.domesticCookiesPath ?? '')

    // 代理（yt-dlp 参数 + Electron session）
    const proxyType = s.proxyType ?? 'none'
    setProxyUrl(buildProxyUrl(proxyType, s.proxyHost, s.proxyPort, s.proxyUsername, s.proxyPassword))
    applySessionProxy(proxyType, s.proxyHost, s.proxyPort).catch((err) => {
      console.error('[proxy] apply failed:', err)
    })

    // LLM + 爆款自动拆解
    setLlmRuntimeConfig(s.llm ?? null)
    setAutoAnalyzeEnabled(!!s.autoAnalyzeHot)

    // YouTube Data API
    setYoutubeApiKey(s.youtubeApiKey?.trim() || null)

    // 订阅定时检查（startScheduler 幂等，间隔未变不重启）
    startScheduler(s.subscriptionCheckInterval || '6h', (results) => {
      const totalNew = results.reduce((sum, r) => sum + r.newVideos.length, 0)
      if (totalNew > 0 && Notification.isSupported()) {
        new Notification({
          title: `定时检查：发现 ${totalNew} 个新视频`,
          body: results.filter((r) => r.newVideos.length > 0).slice(0, 3)
            .map((r) => `${r.subName}：${r.newVideos.length} 个`).join('  ·  '),
        }).show()
      }
      sendToAll('event:sub-scheduler-tick', { totalNew })
    })
  })
}
