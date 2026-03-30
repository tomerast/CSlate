import type { IpcMain } from 'electron'
import { shell } from 'electron'

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    // Only open http/https URLs for security
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url)
    }
  })
}
