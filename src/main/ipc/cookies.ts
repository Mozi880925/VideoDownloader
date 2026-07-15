import { handle, sendTo } from './typed'
import { setCookiesPath, setDouyinCookiesBrowser, setDomesticCookiesPath } from '../services/ytdlp'
import { openYoutubeLoginWindow } from '../services/cookiesService'

export function registerCookiesHandlers(): void {
  handle('cookies:set-path', (_event, filePath) => {
    setCookiesPath(filePath)
  })

  handle('cookies:set-douyin-browser', (_event, browser) => {
    setDouyinCookiesBrowser(browser)
  })

  handle('cookies:set-domestic-path', (_event, filePath) => {
    setDomesticCookiesPath(filePath)
  })

  // 打开 YouTube 登录窗口，关闭后自动导出 cookie 并通知渲染端
  handle('cookies:open-login-window', (event) => {
    openYoutubeLoginWindow((cookiesFilePath) => {
      sendTo(event.sender, 'event:cookies-path-updated', cookiesFilePath)
    })
  })
}
