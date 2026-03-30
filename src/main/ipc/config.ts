import { safeStorage } from 'electron'
import type { IpcMain } from 'electron'
import { configStore } from '../lib/store'
import type { ConfigStore } from '../lib/store'

export const SENSITIVE_KEYS = new Set(['llmApiKey', 'serverApiKey', 'gatewayApiKey'])

const SECURE_PREFIX = '_secure_'

export function getConfigValue(key: string): unknown {
  if (SENSITIVE_KEYS.has(key)) {
    const secureKey = `${SECURE_PREFIX}${key}` as '_secure_llmApiKey' | '_secure_serverApiKey' | '_secure_gatewayApiKey'
    const stored = configStore.get(secureKey)
    if (!stored) return null
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  }
  return configStore.get(key as keyof ConfigStore)
}

export function setConfigValue(key: string, value: unknown): void {
  if (SENSITIVE_KEYS.has(key)) {
    const secureKey = `${SECURE_PREFIX}${key}` as '_secure_llmApiKey' | '_secure_serverApiKey' | '_secure_gatewayApiKey'
    const encrypted = safeStorage.encryptString(String(value))
    configStore.set(secureKey, encrypted.toString('base64'))
    return
  }
  configStore.set(key as keyof ConfigStore, value as any)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('config:get', (_event, key: string) => getConfigValue(key))
  ipcMain.handle('config:set', (_event, args: { key: string; value: unknown }) =>
    setConfigValue(args.key, args.value))
}
