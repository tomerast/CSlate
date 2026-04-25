/**
 * Thin HTTP wrapper around the CSlate-Server REST API.
 *
 * Post-chat-portal surface — only what live code needs:
 *   - `search` / `searchPipelines`   → `searchBlueprints` + `searchPipelineBlueprints`
 *                                       tools and the render-decision skill
 *   - `fetchSource`                   → render-decision pulls the trusted
 *                                       `bundle.js` from the server library
 *
 * The old direct-publish and combined search surfaces were retired in the
 * chat-portal migration. If auto-publish is ever re-added, do it
 * behind a well-defined workflow (202 uploadId → SSE stream → final card)
 * rather than the previous fire-and-forget.
 */

type SearchResponse = {
  results: unknown[]
  total: number
  error?: string
}

type HealthResponse = {
  ok: boolean
  service?: string
  version?: string
  capabilities?: {
    upload?: boolean
    download?: boolean
    search?: boolean
  }
}

type FetchSourceResponse = {
  /** File contents keyed by path, e.g. `{ 'bundle.js': '...', 'ui.tsx': '...' }`. */
  source?: Record<string, string>
  manifest?: unknown
  error?: string
}

/** Raw `{ ... files, ... }` shape that the server actually returns. */
interface ServerSourcePayload {
  files?: Record<string, string>
  manifest?: unknown
}

export class CSlateServerClient {
  private readonly serverUrl: string
  private readonly apiKey: string

  constructor(serverUrl: string, apiKey: string) {
    // Trim trailing slash so URL joins never double up
    this.serverUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl
    this.apiKey = apiKey
  }

  private authHeaders(): HeadersInit {
    return { Authorization: `ApiKey ${this.apiKey}` }
  }

  /**
   * Handshake — verify the remote server is a genuine CSlate server and
   * discover its capabilities (upload / download / search).
   * No API key required; the endpoint is public.
   */
  async health(): Promise<{
    ok: boolean
    valid: boolean
    service?: string
    version?: string
    capabilities?: Record<string, boolean>
    error?: string
  }> {
    try {
      const url = new URL('/api/v1/health', this.serverUrl)
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) {
        return { ok: false, valid: false, error: `Server returned ${res.status}` }
      }
      const data = (await res.json()) as HealthResponse
      if (!data.ok || data.service !== 'cslate-server') {
        return { ok: true, valid: false, error: 'Not a CSlate server' }
      }
      return {
        ok: true,
        valid: true,
        service: data.service,
        version: data.version,
        capabilities: data.capabilities,
      }
    } catch (e) {
      return {
        ok: false,
        valid: false,
        error: e instanceof Error ? e.message : 'Could not reach CSlate server',
      }
    }
  }

  async search(query: string, limit: number): Promise<SearchResponse> {
    try {
      const url = new URL('/api/v1/components/search', this.serverUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))

      const res = await fetch(url.toString(), { headers: this.authHeaders() })

      if (!res.ok) {
        return { results: [], total: 0, error: `Server returned ${res.status}` }
      }

      return (await res.json()) as SearchResponse
    } catch {
      return { results: [], total: 0, error: 'Could not reach CSlate server' }
    }
  }

  async searchPipelines(query: string, limit: number): Promise<SearchResponse> {
    try {
      const url = new URL('/api/v1/pipelines/search', this.serverUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))

      const res = await fetch(url.toString(), { headers: this.authHeaders() })

      if (!res.ok) {
        return { results: [], total: 0, error: `Server returned ${res.status}` }
      }

      return (await res.json()) as SearchResponse
    } catch {
      return { results: [], total: 0, error: 'Could not reach CSlate server' }
    }
  }

  /**
   * Upload a component manifest + source files to the server for review.
   * The server runs the 7-stage review pipeline asynchronously.
   * Returns immediately with an uploadId — review progress can be tracked
   * via GET /upload/:id/status or the SSE stream.
   */
  async uploadComponent(
    manifest: unknown,
    files: Record<string, string>,
  ): Promise<{ uploadId?: string; status?: string; error?: string }> {
    try {
      const url = new URL('/api/v1/components/upload', this.serverUrl)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...this.authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ manifest, files }),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { error: (body as { message?: string }).message ?? `Server returned ${res.status}` }
      }

      return (await res.json()) as { uploadId: string; status: string }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  /**
   * Fetch the stored files + manifest for a published component.
   *
   * The server returns `{ id, manifest, files, summary, version, updatedAt }`
   * but callers in this codebase talk in terms of `source`; we normalize at
   * the boundary so no consumer has to know about the server's field name.
   */
  async fetchSource(componentId: string): Promise<FetchSourceResponse> {
    try {
      const url = new URL(`/api/v1/components/${componentId}/source`, this.serverUrl)
      const res = await fetch(url.toString(), { headers: this.authHeaders() })

      if (!res.ok) {
        return { error: `Server returned ${res.status}` }
      }

      const payload = (await res.json()) as ServerSourcePayload
      return { source: payload.files, manifest: payload.manifest }
    } catch {
      return { error: 'Could not reach CSlate server' }
    }
  }
}
