import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { CSlateServerClient } from '../server/CSlateServerClient'
import { getConfigValue } from './config'

function getClient(): CSlateServerClient | null {
  const serverUrl = getConfigValue('serverUrl') as string | undefined
  const serverApiKey = getConfigValue('serverApiKey') as string | null
  if (!serverUrl || !serverApiKey) return null
  return new CSlateServerClient(serverUrl, serverApiKey)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('server:search', async (_event: IpcMainInvokeEvent, args: { query: string; limit?: number }) => {
    const client = getClient()
    if (!client) return { results: [], total: 0, error: 'Server not configured' }
    return client.search(args.query, args.limit ?? 5)
  })

  ipcMain.handle('server:publish', async (_event: IpcMainInvokeEvent, args: { name: string; description: string; tags: string[]; source: Record<string, string>; manifest?: unknown }) => {
    const client = getClient()
    if (!client) return { error: 'Server not configured' }
    return client.publish(args)
  })
}
