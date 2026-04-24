import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { CSlateServerClient } from '../server/CSlateServerClient'
import { getConfigValue, setConfigValue } from './config'
import { configStore } from '../lib/store'

const DEV_SERVER_URL = 'http://localhost:3000'
const DEV_SERVER_API_KEY = 'cslate_dev_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function getClient(): CSlateServerClient | null {
  const isDev = process.env.NODE_ENV === 'development'
  const serverUrl = (getConfigValue('serverUrl') as string | undefined) || (isDev ? DEV_SERVER_URL : undefined)
  const serverApiKey = (getConfigValue('serverApiKey') as string | null) || (isDev ? DEV_SERVER_API_KEY : null)
  if (!serverUrl || !serverApiKey) return null
  return new CSlateServerClient(serverUrl, serverApiKey)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('server:search', async (_event: IpcMainInvokeEvent, args: { query: string; limit?: number }) => {
    const client = getClient()
    if (!client) return { results: [], total: 0, error: 'Server not configured' }
    return client.search(args.query, args.limit ?? 5)
  })

  ipcMain.handle('server:connect', async (_event: IpcMainInvokeEvent, args: { email: string; serverUrl: string }) => {
    try {
      const base = args.serverUrl.replace(/\/$/, '')
      const res = await fetch(`${base}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: args.email }),
      })
      const data = await res.json() as { apiKey?: string; message?: string; error?: { message: string } }

      if (!res.ok) {
        return { ok: false, message: data.error?.message ?? 'Registration failed' }
      }

      if (data.apiKey) {
        // Dev mode (DEV_SKIP_EMAIL_VERIFY=true) or email already verified: key returned immediately
        setConfigValue('serverApiKey', data.apiKey)
        configStore.set('serverEmail', args.email)
        return { ok: true, connected: true }
      }

      // Prod mode: verification email sent, key comes after user clicks link
      return { ok: true, connected: false, message: data.message ?? 'Check your email to complete connection' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' }
    }
  })

  ipcMain.handle('server:disconnect', async () => {
    setConfigValue('serverApiKey', '')
    configStore.delete('serverEmail')
    return { ok: true }
  })
}
