import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWebFetchCSTool } from '../webFetch'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockServerClient = {
  searchBlueprints: vi.fn(),
}

describe('webFetch tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches CSlate server first when query is provided', async () => {
    mockServerClient.searchBlueprints.mockResolvedValue([{ name: 'Button', description: 'A button' }])
    const tool = createWebFetchCSTool(mockServerClient as any)
    const result = await tool.call({ query: 'button component' })
    const data = result.data as { content: string; source: string }
    expect(mockServerClient.searchBlueprints).toHaveBeenCalledWith('button component')
    expect(data.source).toBe('cslate-server')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('falls back to DuckDuckGo when server returns empty results', async () => {
    mockServerClient.searchBlueprints.mockResolvedValue([])
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ AbstractText: 'A button is a UI element.' }),
      text: async () => '',
    })
    const tool = createWebFetchCSTool(mockServerClient as any)
    const result = await tool.call({ query: 'what is a button' })
    const data = result.data as { content: string; source: string }
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('duckduckgo'))
    expect(data.source).toBe('web')
  })

  it('fetches a direct URL bypassing CSlate server', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body><main>Hello world</main></body></html>',
    })
    const tool = createWebFetchCSTool(null)
    const result = await tool.call({ url: 'https://example.com/docs' })
    const data = result.data as { content: string; source: string }
    expect(data.source).toBe('web')
    expect(mockServerClient.searchBlueprints).not.toHaveBeenCalled()
  })

  it('strips HTML from fetched pages', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body><p>Hello <b>world</b></p></body></html>',
    })
    const tool = createWebFetchCSTool(null)
    const result = await tool.call({ url: 'https://example.com' })
    const data = result.data as { content: string }
    expect(data.content).not.toContain('<html>')
    expect(data.content).not.toContain('<b>')
    expect(data.content).toContain('Hello')
    expect(data.content).toContain('world')
  })

  it('returns error when no url or query provided', async () => {
    const tool = createWebFetchCSTool(null)
    const result = await tool.call({})
    expect(result.data).toHaveProperty('error')
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createWebFetchCSTool(null)
    expect(tool.isReadOnly({})).toBe(true)
    expect(tool.isConcurrencySafe({})).toBe(true)
  })
})
