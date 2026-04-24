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
    it('constructs the correct URL and sends the ApiKey header', async () => {
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
        }),
      )
    })

    it('returns the server payload on success', async () => {
      const results = [
        { id: '1', name: 'Todo List', score: 0.95 },
        { id: '2', name: 'Todo Card', score: 0.8 },
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results, total: 2 }) }),
      )

      const result = await client.search('todo', 10)

      expect(result).toEqual({ results, total: 2 })
      expect(result.error).toBeUndefined()
    })

    it('returns an error envelope on non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
      const result = await client.search('query', 5)
      expect(result).toEqual({ results: [], total: 0, error: 'Server returned 403' })
    })

    it('returns an error envelope on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
      const result = await client.search('query', 5)
      expect(result).toEqual({
        results: [],
        total: 0,
        error: 'Could not reach CSlate server',
      })
    })

    it('URL-encodes special characters in the query', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ results: [], total: 0 }) })
      vi.stubGlobal('fetch', mockFetch)

      await client.search('todo & notes?', 3)
      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('todo+%26+notes%3F')
    })
  })

  describe('searchPipelines', () => {
    it('hits the pipelines search endpoint', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ results: [], total: 0 }) })
      vi.stubGlobal('fetch', mockFetch)

      await client.searchPipelines('data stream', 4)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/pipelines/search?q=data+stream&limit=4',
        expect.objectContaining({ headers: { Authorization: 'ApiKey test-api-key' } }),
      )
    })
  })

  describe('fetchSource', () => {
    it('constructs the correct URL and sends the ApiKey header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'x', manifest: {}, files: {}, version: '1.0.0' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      await client.fetchSource('comp-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/components/comp-123/source',
        expect.objectContaining({
          headers: { Authorization: 'ApiKey test-api-key' },
        }),
      )
    })

    it(
      'maps the server "files" field to "source" — regression guard for the ' +
        'silent bug where render-decision never saw a library bundle',
      async () => {
        const files = { 'ui.tsx': 'export default () => null', 'bundle.js': 'cjs' }
        const manifest = { name: 'Todo', description: 'x', tags: ['todo'] }
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
              id: 'comp-456',
              manifest,
              files,
              version: '1.0.0',
              updatedAt: new Date().toISOString(),
            }),
          }),
        )

        const result = await client.fetchSource('comp-456')

        expect(result.source).toEqual(files)
        expect(result.manifest).toEqual(manifest)
        expect(result.error).toBeUndefined()
      },
    )

    it('returns an error envelope on 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
      const result = await client.fetchSource('missing')
      expect(result.error).toBe('Server returned 404')
      expect(result.source).toBeUndefined()
    })

    it('returns an error envelope on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')))
      const result = await client.fetchSource('comp-789')
      expect(result.error).toBe('Could not reach CSlate server')
    })
  })

  describe('constructor', () => {
    it('trims a trailing slash from the server URL', async () => {
      const withSlash = new CSlateServerClient('http://localhost:3001/', 'key')
      const mockFetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ results: [], total: 0 }) })
      vi.stubGlobal('fetch', mockFetch)

      await withSlash.search('test', 5)

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).not.toContain('//api')
    })
  })
})
