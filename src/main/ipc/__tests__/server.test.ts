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
    delete(key: string) {
      storeData.delete(key)
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
const mockHealth = vi.fn()
vi.mock('../../server/CSlateServerClient', () => ({
  CSlateServerClient: class {
    constructor(public serverUrl: string, public apiKey: string) {}
    search = mockSearch
    health = mockHealth
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

describe('server IPC — server:health', () => {
  it('returns valid=true when the server responds with a cslate-server identity', async () => {
    mockHealth.mockResolvedValue({
      ok: true,
      valid: true,
      service: 'cslate-server',
      version: '0.1.0',
      capabilities: { upload: true, download: true },
    })

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:health', { serverUrl: 'http://localhost:3000' })

    expect(result.valid).toBe(true)
    expect(result.service).toBe('cslate-server')
    expect(result.capabilities).toEqual({ upload: true, download: true })
  })

  it('returns valid=false when health probe reports an error', async () => {
    mockHealth.mockResolvedValue({
      ok: false,
      valid: false,
      error: 'Connection refused',
    })

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:health', { serverUrl: 'http://offline:3000' })

    expect(result.ok).toBe(false)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Connection refused')
  })
})

describe('server IPC — server:connect', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiKey: 'new-api-key' }),
      }),
    )
  })

  it('registers after a successful handshake and stores the apiKey + email', async () => {
    mockHealth.mockResolvedValue({ ok: true, valid: true })

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:connect', {
      email: 'dev@cslate.com',
      serverUrl: 'http://localhost:3000',
    })

    expect(result).toEqual({ ok: true, connected: true })
    expect(storeData.get('serverEmail')).toBe('dev@cslate.com')
    expect(mockEncrypt).toHaveBeenCalledWith('new-api-key')
  })

  it('blocks registration when the handshake fails', async () => {
    mockHealth.mockResolvedValue({ ok: false, valid: false, error: 'Not a CSlate server' })

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:connect', {
      email: 'dev@cslate.com',
      serverUrl: 'http://evil.com',
    })

    expect(result.ok).toBe(false)
    expect(result.message).toBe('Not a CSlate server')
  })

  it('returns pending_email when the key is not returned immediately', async () => {
    mockHealth.mockResolvedValue({ ok: true, valid: true })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Check your email' }),
      }),
    )

    const ipc = createMockIpcMain()
    register(ipc)

    const result = await (ipc as any)._invoke('server:connect', {
      email: 'dev@cslate.com',
      serverUrl: 'http://localhost:3000',
    })

    expect(result).toEqual({ ok: true, connected: false, message: 'Check your email' })
  })
})
