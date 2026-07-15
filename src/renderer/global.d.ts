import type { RendererApi, RendererListeners } from '../shared/ipcContract'

declare global {
  interface ElectronAPI {
    minimize: () => void
    maximize: () => void
    close: () => void
  }

  interface Window {
    electronAPI: ElectronAPI
    api: RendererApi &
      RendererListeners & {
        /** 获取拖拽进来的 File 对象的本地绝对路径（Electron 32+ 必须用此方法） */
        getPathForFile: (file: File) => string
      }
  }
}

export {}
