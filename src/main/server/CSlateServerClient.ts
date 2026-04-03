type SearchResponse = {
  results: unknown[]
  total: number
  error?: string
}

type RawManifest = Record<string, unknown>

type PublishPayload = {
  name: string
  description: string
  tags: string[]
  source: Record<string, string>
  manifest?: unknown
}

type PublishResponse = {
  id?: string
  status?: string
  error?: string
}

type FetchSourceResponse = {
  source?: Record<string, string>
  manifest?: unknown
  error?: string
}

type PipelineSearchResponse = {
  results: unknown[]
  total: number
  error?: string
}

type PipelinePublishPayload = {
  manifest: unknown
  files: Record<string, string>
}

type PipelinePublishResponse = {
  uploadId?: string
  status?: string
  error?: string
}

type PipelineFetchSourceResponse = {
  source?: Record<string, string>
  manifest?: unknown
  error?: string
}

type CombinedSearchResponse = {
  components: unknown[]
  pipelines: unknown[]
}

export class CSlateServerClient {
  private readonly serverUrl: string
  private readonly apiKey: string

  constructor(serverUrl: string, apiKey: string) {
    // Remove trailing slash if present to avoid double slashes in URLs
    this.serverUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl
    this.apiKey = apiKey
  }

  async search(query: string, limit: number): Promise<SearchResponse> {
    try {
      const url = new URL('/api/v1/components/search', this.serverUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))

      const res = await fetch(url.toString(), {
        headers: { Authorization: `ApiKey ${this.apiKey}` },
      })

      if (!res.ok) {
        return { results: [], total: 0, error: `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { results: [], total: 0, error: 'Could not reach CSlate server' }
    }
  }

  async publish(payload: PublishPayload): Promise<PublishResponse> {
    try {
      const url = new URL('/api/v1/components/upload', this.serverUrl)

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          manifest: this.normalizeManifest(payload),
          files: payload.source,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
        return { error: body.error?.message ?? `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { error: 'Could not reach CSlate server' }
    }
  }

  /**
   * Normalizes the client manifest.json to match the server's upload schema.
   * The client uses @cslate/shared format (records for inputs/outputs/events/actions,
   * FileEntry objects for files) while the server expects arrays and filename strings.
   * See packages/pipeline/src/types.ts for the full server schema.
   */
  private normalizeManifest(payload: PublishPayload): RawManifest {
    const raw = (payload.manifest ?? {}) as RawManifest
    const displayName = (raw.name as string | undefined) ?? payload.name

    // Derive a URL-safe slug: "Kanban Task Manager" → "kanban_task_manager"
    const name = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')

    // Convert a {key: {...}} record to [{name: key, ...rest}] array
    function recordToArray(value: unknown): RawManifest[] | undefined {
      if (value == null) return undefined
      if (Array.isArray(value)) return value.length > 0 ? (value as RawManifest[]) : undefined
      if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, RawManifest>).map(([k, v]) => ({
          name: k,
          ...(typeof v === 'object' && v !== null ? v : {}),
        }))
        return entries.length > 0 ? entries : undefined
      }
      return undefined
    }

    // Normalize files: [{path: "ui.tsx", ...}] → ["ui.tsx"], falling back to source keys
    let files: string[]
    const rawFiles = raw.files
    if (Array.isArray(rawFiles) && rawFiles.length > 0) {
      files = rawFiles.map(f => typeof f === 'string' ? f : (f as RawManifest).path as string ?? String(f))
    } else {
      files = Object.keys(payload.source)
    }
    if (files.length === 0) files = Object.keys(payload.source)

    const normalized: RawManifest = {
      ...raw,
      name,
      title: displayName,
      description: (raw.description as string | undefined) ?? payload.description,
      version: (raw.version as string | undefined) ?? '1.0.0',
      files,
      tags: Array.isArray(raw.tags) && (raw.tags as string[]).length > 0
        ? raw.tags
        : payload.tags.length > 0 ? payload.tags : ['component'],
    }

    // Convert records to arrays (server schema uses arrays, shared schema uses records)
    const inputs = recordToArray(raw.inputs)
    if (inputs) normalized.inputs = inputs
    else delete normalized.inputs

    const outputs = recordToArray(raw.outputs)
    if (outputs) normalized.outputs = outputs
    else delete normalized.outputs

    const events = recordToArray(raw.events)
    if (events) normalized.events = events
    else delete normalized.events

    const actions = recordToArray(raw.actions)
    if (actions) normalized.actions = actions
    else delete normalized.actions

    return normalized
  }

  async searchPipelines(query: string, limit: number): Promise<SearchResponse> {
    try {
      const url = new URL('/api/v1/pipelines/search', this.serverUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))

      const res = await fetch(url.toString(), {
        headers: { Authorization: `ApiKey ${this.apiKey}` },
      })

      if (!res.ok) {
        return { results: [], total: 0, error: `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { results: [], total: 0, error: 'Could not reach CSlate server' }
    }
  }

  async fetchSource(componentId: string): Promise<FetchSourceResponse> {
    try {
      const url = new URL(`/api/v1/components/${componentId}/source`, this.serverUrl)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `ApiKey ${this.apiKey}` },
      })

      if (!res.ok) {
        return { error: `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { error: 'Could not reach CSlate server' }
    }
  }

  async publishPipeline(payload: PipelinePublishPayload): Promise<PipelinePublishResponse> {
    try {
      const res = await fetch(
        new URL('/api/v1/pipelines/upload', this.serverUrl).toString(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `ApiKey ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        },
      )

      if (!res.ok) {
        return { error: `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { error: 'Could not reach CSlate server' }
    }
  }

  async fetchPipelineSource(pipelineId: string): Promise<PipelineFetchSourceResponse> {
    try {
      const res = await fetch(
        new URL(`/api/v1/pipelines/${pipelineId}/source`, this.serverUrl).toString(),
        {
          headers: { Authorization: `ApiKey ${this.apiKey}` },
        },
      )

      if (!res.ok) {
        return { error: `Server returned ${res.status}` }
      }

      const data = await res.json()
      return { source: data.files, manifest: data.manifest }
    } catch {
      return { error: 'Could not reach CSlate server' }
    }
  }

  async searchAll(query: string, limit: number): Promise<CombinedSearchResponse> {
    try {
      const url = new URL('/api/v1/search', this.serverUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))

      const res = await fetch(url.toString(), {
        headers: { Authorization: `ApiKey ${this.apiKey}` },
      })

      if (!res.ok) {
        return { components: [], pipelines: [] }
      }

      return await res.json()
    } catch {
      return { components: [], pipelines: [] }
    }
  }
}
