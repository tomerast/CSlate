import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CSlateServerClient } from '../CSlateServerClient'

describe('CSlateServerClient', () => {
  let client: CSlateServerClient
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    client = new CSlateServerClient('http://localhost:3001', 'test-api-key')
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('search', () => {
    it('constructs correct URL and includes auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], total: 0 }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.search('todo component', 5)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/components/search?q=todo+component&limit=5',
        expect.objectContaining({
          headers: { Authorization: 'ApiKey test-api-key' },
        })
      )
    })

    it('returns results on successful response', async () => {
      const mockResults = [
        { id: '1', name: 'Todo List', score: 0.95 },
        { id: '2', name: 'Todo Card', score: 0.8 },
      ]
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockResults, total: 2 }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.search('todo', 10)

      expect(result).toEqual({ results: mockResults, total: 2 })
      expect(result.error).toBeUndefined()
    })

    it('returns error object on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.search('query', 5)

      expect(result.error).toBe('Server returned 403')
      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
    })

    it('returns error object on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.search('query', 5)

      expect(result.error).toBe('Could not reach CSlate server')
      expect(result.results).toEqual([])
      expect(result.total).toBe(0)
    })

    it('handles special characters in query', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], total: 0 }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.search('todo & notes?', 3)

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('todo+%26+notes%3F')
    })
  })

  describe('publish', () => {
    it('constructs correct URL and includes auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'comp-123', status: 'published' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const payload = {
        name: 'TodoList',
        description: 'A simple todo component',
        tags: ['productivity', 'todo'],
        source: { 'ui.tsx': 'export default function() {}' },
      }

      await client.publish(payload)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/components/upload',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'ApiKey test-api-key',
            'Content-Type': 'application/json',
          },
        })
      )

      // Verify normalized payload structure
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      expect(sentBody.manifest).toMatchObject({
        name: 'todolist',
        title: 'TodoList',
        description: 'A simple todo component',
        tags: ['productivity', 'todo'],
        files: ['ui.tsx'],
      })
      expect(sentBody.files).toEqual({ 'ui.tsx': 'export default function() {}' })
    })

    it('returns id and status on successful publish', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'comp-456', status: 'published' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.publish({
        name: 'Test',
        description: 'test',
        tags: [],
        source: { 'ui.tsx': 'code' },
      })

      expect(result).toEqual({ id: 'comp-456', status: 'published' })
      expect(result.error).toBeUndefined()
    })

    it('includes optional manifest in payload and normalizes it', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'comp-789', status: 'published' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const manifest = {
        name: 'Test',
        description: 'test',
        tags: [],
        inputs: {},
        outputs: {},
        events: {},
        actions: {},
        files: ['ui.tsx'],
        defaultSize: { width: 10, height: 10 },
      }

      await client.publish({
        name: 'Test',
        description: 'test',
        tags: [],
        source: { 'ui.tsx': 'code' },
        manifest,
      })

      const calledBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      // normalizeManifest lowercases name, adds title, version, strips empty records
      expect(calledBody.manifest).toMatchObject({
        name: 'test',
        title: 'Test',
        description: 'test',
        version: '1.0.0',
        files: ['ui.tsx'],
        defaultSize: { width: 10, height: 10 },
      })
      // Empty records (inputs/outputs/events/actions) are stripped
      expect(calledBody.manifest.inputs).toBeUndefined()
      expect(calledBody.manifest.outputs).toBeUndefined()
      expect(calledBody.manifest.events).toBeUndefined()
      expect(calledBody.manifest.actions).toBeUndefined()
      // Source is sent as files
      expect(calledBody.files).toEqual({ 'ui.tsx': 'code' })
    })

    it('returns error object on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid component data' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.publish({
        name: 'Bad',
        description: 'bad',
        tags: [],
        source: {},
      })

      expect(result.error).toBe('Invalid component data')
      expect(result.id).toBeUndefined()
      expect(result.status).toBeUndefined()
    })

    it('returns error object on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.publish({
        name: 'Test',
        description: 'test',
        tags: [],
        source: {},
      })

      expect(result.error).toBe('Could not reach CSlate server')
    })
  })

  describe('fetchSource', () => {
    it('constructs correct URL and includes auth header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ source: {}, manifest: {} }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.fetchSource('comp-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/components/comp-123/source',
        expect.objectContaining({
          headers: { Authorization: 'ApiKey test-api-key' },
        })
      )
    })

    it('returns source and manifest on success', async () => {
      const mockSource = { 'ui.tsx': 'code', 'styles.css': 'styles' }
      const mockManifest = {
        name: 'TodoList',
        description: 'A todo component',
        tags: ['todo'],
        inputs: {},
        outputs: {},
        events: {},
        actions: {},
        files: ['ui.tsx', 'styles.css'],
        defaultSize: { width: 10, height: 10 },
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ source: mockSource, manifest: mockManifest }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.fetchSource('comp-456')

      expect(result).toEqual({ source: mockSource, manifest: mockManifest })
      expect(result.error).toBeUndefined()
    })

    it('returns error object on non-OK response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.fetchSource('nonexistent-id')

      expect(result.error).toBe('Server returned 404')
      expect(result.source).toBeUndefined()
      expect(result.manifest).toBeUndefined()
    })

    it('returns error object on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Timeout'))
      vi.stubGlobal('fetch', mockFetch)

      const result = await client.fetchSource('comp-789')

      expect(result.error).toBe('Could not reach CSlate server')
    })

    it('handles component IDs with special characters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ source: {}, manifest: {} }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.fetchSource('comp-123-abc')

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toBe('http://localhost:3001/api/v1/components/comp-123-abc/source')
    })
  })

  describe('constructor', () => {
    it('accepts server URL and API key', () => {
      const customClient = new CSlateServerClient('https://custom.server.com', 'custom-key')
      expect(customClient).toBeInstanceOf(CSlateServerClient)
    })

    it('handles trailing slash in server URL', async () => {
      const clientWithSlash = new CSlateServerClient('http://localhost:3001/', 'key')
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], total: 0 }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await clientWithSlash.search('test', 5)

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).not.toContain('//api')
    })
  })
})
