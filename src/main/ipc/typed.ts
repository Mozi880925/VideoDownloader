import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { IpcInvokeContract, IpcEventContract } from '../../shared/ipcContract'

/** 类型安全的 ipcMain.handle：通道名与签名由 shared/ipcContract.ts 契约约束 */
export function handle<C extends keyof IpcInvokeContract>(
  channel: C,
  fn: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeContract[C]['args']
  ) => IpcInvokeContract[C]['result'] | Promise<IpcInvokeContract[C]['result']>,
): void {
  ipcMain.handle(channel, fn as never)
}

/** 向所有窗口推送事件（类型安全的 webContents.send） */
export function sendToAll<C extends keyof IpcEventContract>(
  channel: C,
  ...args: IpcEventContract[C]
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }
}

/** 向指定 webContents 推送事件 */
export function sendTo<C extends keyof IpcEventContract>(
  target: Electron.WebContents,
  channel: C,
  ...args: IpcEventContract[C]
): void {
  if (!target.isDestroyed()) {
    target.send(channel, ...args)
  }
}
