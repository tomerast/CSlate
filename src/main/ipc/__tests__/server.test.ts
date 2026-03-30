import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcMain } from 'electron'

// Mock electron-store
const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def?: unknown) { return storeData.has(key) ? storeData.get(key) : def }
    set(key: string, val: unknown) { storeData.set(key, val) }
  }
}))

// Mock electron safeStorage
const mockEncrypt = vi.fn((s: string) => Buffer.from(`enc:${s}`))
const mockDecrypt = vi.fn((b: Buffer) => b.toString().replace(/^enc:/, ''))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: mockEncrypt,
    decryptString: mockDecrypt,
  }
}))

// Mock CSlateServerClient
const mockSearch = vi.fn()
const mockPublish = vi.fn()
vi.mock('../../server/CSlateServerClient', () => ({
  CSlateServerClient: class {
    constructor(public serverUrl: string, public apiKey: string) {}
    search = mockSearch
    publish = mockPublish
  }
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
    // Helper to call handlers in tests
    _invoke: (channel: string, args: any) => {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`No handler for ${channel}`)
      return handler({}, args)
    }
  } as any
}

describe('server IPC handlers', () => {
  describe('server:search', () => {
    it('returns error when server is not configured', async () => {
      const ipc = createMockIpcMain()
      register(ipc)

      const result = await (ipc as any)._invoke('server:search', { query: 'test' })

      expect(result).toEqual({ results: [], total: 0, error: 'Server not configured' })
      expect(mockSearch).not.toHaveBeenCalled()
    })

    it('calls CSlateServerClient.search when configured', async () => {
      setConfigValue('serverUrl', 'http://localhost:3000')
      setConfigValue('serverApiKey', 'test-key')

      mockSearch.mockResolvedValue({ results: [{ id: '1', name: 'test' }], total: 1 })

      const ipc = createMockIpcMain()
      register(ipc)

      const result = await (ipc as any)._invoke('server:search', { query: 'test component', limit: 3 })

      expect(mockSearch).toHaveBeenCalledWith('test component', 3)
      expect(result).toEqual({ results: [{ id: '1', name: 'test' }], total: 1 })
    })

    it('uses default limit of 5 when not provided', async () => {
      setConfigValue('serverUrl', 'http://localhost:3000')
      setConfigValue('serverApiKey', 'test-key')

      mockSearch.mockResolvedValue({ results: [], total: 0 })

      const ipc = createMockIpcMain()
      register(ipc)

      await (ipc as any)._invoke('server:search', { query: 'test' })

      expect(mockSearch).toHaveBeenCalledWith('test', 5)
    })

    it('returns null when serverUrl is missing', async () => {
      setConfigValue('serverApiKey', 'test-key')
      // serverUrl not set

      const ipc = createMockIpcMain()
      register(ipc)

      const result = await (ipc as any)._invoke('server:search', { query: 'test' })

      expect(result).toEqual({ results: [], total: 0, error: 'Server not configured' })
    })

    it('returns null when serverApiKey is missing', async () => {
      setConfigValue('serverUrl', 'http://localhost:3000')
      // serverApiKey not set

      const ipc = createMockIpcMain()
      register(ipc)

      const result = await (ipc as any)._invoke('server:search', { query: 'test' })

      expect(result).toEqual({ results: [], total: 0, error: 'Server not configured' })
    })
  })

  describe('server:publish', () => {
    it('returns error when server is not configured', async () => {
      const ipc = createMockIpcMain()
      register(ipc)

      const result = await (ipc as any)._invoke('server:publish', {
        name: 'test',
        description: 'desc',
        tags: ['tag1'],
        source: { 'main.tsx': 'code' }
      })

      expect(result).toEqual({ error: 'Server not configured' })
      expect(mockPublish).not.toHaveBeenCalled()
    })

    it('calls CSlateServerClient.publish when configured', async () => {
      setConfigValue('serverUrl', 'http://localhost:3000')
      setConfigValue('serverApiKey', 'test-key')

      mockPublish.mockResolvedValue({ id: 'comp-123', status: 'success' })

      const ipc = createMockIpcMain()
      register(ipc)

      const payload = {
        name: 'MyComponent',
        description: 'A test component',
        tags: ['react', 'ui'],
        source: { 'main.tsx': 'export default function() {}' },
        manifest: { id: 'test' }
      }

      const result = await (ipc as any)._invoke('server:publish', payload)

      expect(mockPublish).toHaveBeenCalledWith(payload)
      expect(result).toEqual({ id: 'comp-123', status: 'success' })
    })

    it('works without optional manifest field', async () => {
      setConfigValue('serverUrl', 'http://localhost:3000')
      setConfigValue('serverApiKey', 'test-key')

      mockPublish.mockResolvedValue({ id: 'comp-456', status: 'success' })

      const ipc = createMockIpcMain()
      register(ipc)

      const payload = {
        name: 'SimpleComponent',
        description: 'No manifest',
        tags: [],
        source: { 'index.tsx': 'code' }
      }

      const result = await (ipc as any)._invoke('server:publish', payload)

      expect(mockPublish).toHaveBeenCalledWith(payload)
      expect(result).toEqual({ id: 'comp-456', status: 'success' })
    })
  })
})
