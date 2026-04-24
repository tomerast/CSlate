import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcMain } from 'electron'

const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def?: unknown) {
      return storeData.has(key) ? storeData.get(key) : def
    }
    set(key: string, val: unknown) {
      storeData.set(key, val)
    }
  },
}))

const mockEncrypt = vi.fn((s: string) => Buffer.from(`enc:${s}`))
const mockDecrypt = vi.fn((b: Buffer) => b.toString().replace(/^enc:/, ''))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: mockEncrypt,
    decryptString: mockDecrypt,
  },
}))

const mockSearch = vi.fn()
vi.mock('../../server/CSlateServerClient', () => ({
  CSlateServerClient: class {
    constructor(public serverUrl: string, public apiKey: string) {}
    search = mockSearch
  },
}))

beforeEach(() => {
  storeData.clear()
  vi.clearAllMocks()
})

const { register } = await import('../server')
const { setConfigValue } = await import('../config')

function createMockIpcMain(): IpcMain {
  const handlers = new Map<string, Function>()
  return {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    },
    _invoke: (channel: string, args: unknown) => {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`No handler for ${channel}`)
      return handler({}, args)
    },
  } as unknown as IpcMain
}

describe('server IPC — server:search', () => {
  it('returns a "not configured" error when no server is set', async () => {
    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:search', { query: 'test' })

    expect(result).toEqual({ results: [], total: 0, error: 'Server not configured' })
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('forwards query + limit to CSlateServerClient.search', async () => {
    setConfigValue('serverUrl', 'http://localhost:3000')
    setConfigValue('serverApiKey', 'test-key')

    mockSearch.mockResolvedValue({ results: [{ id: '1', name: 'test' }], total: 1 })

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:search', {
      query: 'test component',
      limit: 3,
    })

    expect(mockSearch).toHaveBeenCalledWith('test component', 3)
    expect(result).toEqual({ results: [{ id: '1', name: 'test' }], total: 1 })
  })

  it('defaults limit to 5 when omitted', async () => {
    setConfigValue('serverUrl', 'http://localhost:3000')
    setConfigValue('serverApiKey', 'test-key')
    mockSearch.mockResolvedValue({ results: [], total: 0 })

    const ipc = createMockIpcMain()
    register(ipc)

    await (ipc as any)._invoke('server:search', { query: 'test' })

    expect(mockSearch).toHaveBeenCalledWith('test', 5)
  })

  it('treats missing serverUrl as not-configured', async () => {
    setConfigValue('serverApiKey', 'test-key')

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:search', { query: 'test' })

    expect(result).toEqual({ results: [], total: 0, error: 'Server not configured' })
  })

  it('treats missing serverApiKey as not-configured', async () => {
    setConfigValue('serverUrl', 'http://localhost:3000')

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:search', { query: 'test' })

    expect(result).toEqual({ results: [], total: 0, error: 'Server not configured' })
  })
})
