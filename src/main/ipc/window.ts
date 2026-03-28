import { app, BrowserWindow } from 'electron'
import type { IpcMain } from 'electron'

export function getAppVersion(): string {
  return app.getVersion()
}

export function setWindowTitle(title: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.setTitle(title)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('app:get-version', () => getAppVersion())
  ipcMain.handle('window:set-title', (_e, args: { title: string }) => setWindowTitle(args.title))
}
