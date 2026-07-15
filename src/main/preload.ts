import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  apiMethods,
  listenerMethods,
  type RendererApi,
  type RendererListeners,
} from '../shared/ipcContract'

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
})

// invoke 方法：由契约的 apiMethods 映射工厂生成（方法名 → 通道名）
const invokeApi = Object.fromEntries(
  Object.entries(apiMethods).map(([method, channel]) => [
    method,
    (...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  ]),
) as unknown as RendererApi

// 事件订阅方法：注册回调并返回取消监听函数
const listenerApi = Object.fromEntries(
  Object.entries(listenerMethods).map(([method, channel]) => [
    method,
    (callback: (...args: unknown[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  ]),
) as unknown as RendererListeners

contextBridge.exposeInMainWorld('api', {
  ...invokeApi,
  ...listenerApi,
  /** 获取拖拽进来的 File 对象的本地绝对路径（Electron 32+ 必须用此方法） */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
})
