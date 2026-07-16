import { registerWindowHandlers } from './window'
import { registerFsHandlers } from './fs'
import { registerDownloadHandlers } from './download'
import { registerYtdlpHandlers } from './ytdlp'
import { registerMediaHandlers } from './media'
import { registerDbHandlers } from './db'
import { registerSubscriptionHandlers } from './subscription'
import { registerNetworkHandlers } from './network'
import { registerLlmHandlers } from './llm'
import { registerCookiesHandlers } from './cookies'
import { registerRadarHandlers } from './radar'
import { registerSettingsHandlers, bootstrapSettingsConsumers } from './settings'

/** 注册全部 IPC handler（在 app.whenReady 后调用一次） */
export function registerAllIpc(): void {
  registerFsHandlers()
  registerDownloadHandlers()
  registerYtdlpHandlers()
  registerMediaHandlers()
  registerDbHandlers()
  registerSubscriptionHandlers()
  registerNetworkHandlers()
  registerLlmHandlers()
  registerCookiesHandlers()
  registerRadarHandlers()
  registerSettingsHandlers()
  bootstrapSettingsConsumers()
}

export { registerWindowHandlers }
