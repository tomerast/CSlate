import type { IpcMain } from 'electron'

type DataSourceEndpoint = {
  path?: unknown
  method?: unknown
}

type DataSource = {
  baseUrl?: unknown
  endpoints?: unknown
}

type BridgeFetchInput = {
  sourceId: string
  endpointId: string
  params?: Record<string, unknown>
  source: DataSource
  endpoint: DataSourceEndpoint
}

const REQUEST_TIMEOUT_MS = 10_000

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBlockedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.local')
  ) {
    return true
  }

  const parts = normalized.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

export function buildBridgeFetchUrl(input: BridgeFetchInput): { url: string; method: string } {
  const baseUrl = input.source.baseUrl
  const path = input.endpoint.path
  const method = typeof input.endpoint.method === 'string' ? input.endpoint.method.toUpperCase() : 'GET'

  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error(`Data source "${input.sourceId}" is missing baseUrl`)
  }
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(`Endpoint "${input.sourceId}/${input.endpointId}" must declare an absolute path`)
  }
  if (method !== 'GET') {
    throw new Error(`Endpoint "${input.sourceId}/${input.endpointId}" uses unsupported method "${method}"`)
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const url = new URL(path.replace(/^\/+/, ''), normalizedBase)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Endpoint "${input.sourceId}/${input.endpointId}" must use http or https`)
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error(`Endpoint "${input.sourceId}/${input.endpointId}" targets a blocked host`)
  }

  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.map((item) => String(item)).join(','))
    } else {
      url.searchParams.set(key, String(value))
    }
  }

  return { url: url.toString(), method }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('bridge:fetch', async (_event, input: BridgeFetchInput) => {
    if (!isPlainRecord(input) || !isPlainRecord(input.source) || !isPlainRecord(input.endpoint)) {
      throw new Error('Invalid bridge fetch request')
    }

    const { url, method } = buildBridgeFetchUrl(input)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method,
        headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
        signal: controller.signal,
      })
      const text = await response.text()

      if (!response.ok) {
        throw new Error(`Bridge fetch failed (${response.status}): ${text.slice(0, 240)}`)
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        return text ? JSON.parse(text) : null
      }
      return text
    } finally {
      clearTimeout(timeout)
    }
  })
}
