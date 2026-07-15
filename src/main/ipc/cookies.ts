import { handle, sendTo } from './typed'
import { openYoutubeLoginWindow } from '../services/cookiesService'

export function registerCookiesHandlers(): void {
  // 打开 YouTube 登录窗口，关闭后自动导出 cookie 并通知渲染端
  handle('cookies:open-login-window', (event) => {
    openYoutubeLoginWindow((cookiesFilePath) => {
      sendTo(event.sender, 'event:cookies-path-updated', cookiesFilePath)
    })
  })
}
