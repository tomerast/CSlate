import type { IpcMain } from 'electron'
import { memoryStore } from '../memory/store'

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('memory:list', () => memoryStore.list())

  ipcMain.handle('memory:read', (_e, { name }: { name: string }) =>
    memoryStore.read(name),
  )

  ipcMain.handle(
    'memory:write',
    (_e, { name, content }: { name: string; content: string }) =>
      memoryStore.write(name, content),
  )
}
