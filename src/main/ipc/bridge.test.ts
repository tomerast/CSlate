import { describe, expect, it } from 'vitest'
import { buildBridgeFetchUrl } from './bridge'

describe('bridge IPC helpers', () => {
  it('builds GET URLs from manifest-backed endpoint definitions', () => {
    const result = buildBridgeFetchUrl({
      sourceId: 'coingecko',
      endpointId: 'getSimplePrice',
      source: {
        baseUrl: 'https://api.coingecko.com/api/v3',
      },
      endpoint: {
        path: '/simple/price',
        method: 'GET',
      },
      params: {
        ids: 'bitcoin',
        vs_currencies: 'usd',
        include_24hr_change: true,
      },
    })

    expect(result.method).toBe('GET')
    expect(result.url).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
    )
  })

  it('blocks local network targets from component manifests', () => {
    expect(() => buildBridgeFetchUrl({
      sourceId: 'local',
      endpointId: 'status',
      source: { baseUrl: 'http://localhost:3000' },
      endpoint: { path: '/status', method: 'GET' },
      params: {},
    })).toThrow('blocked host')
  })

  it('rejects non-GET endpoints', () => {
    expect(() => buildBridgeFetchUrl({
      sourceId: 'api',
      endpointId: 'create',
      source: { baseUrl: 'https://example.com' },
      endpoint: { path: '/items', method: 'POST' },
      params: {},
    })).toThrow('unsupported method')
  })
})
