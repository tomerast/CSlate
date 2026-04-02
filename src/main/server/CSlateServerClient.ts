type SearchResponse = {
  results: unknown[]
  total: number
  error?: string
}

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
      const url = new URL('/api/components/search', this.serverUrl)
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
      const url = new URL('/api/components/upload', this.serverUrl)

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Authorization: `ApiKey ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        return { error: `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { error: 'Could not reach CSlate server' }
    }
  }

  async fetchSource(componentId: string): Promise<FetchSourceResponse> {
    try {
      const url = new URL(`/api/components/${componentId}/source`, this.serverUrl)

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

  async searchPipelines(query: string, limit: number): Promise<PipelineSearchResponse> {
    try {
      const url = new URL('/api/v1/pipelines/search', this.serverUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      if (!res.ok) {
        return { results: [], total: 0, error: `Server returned ${res.status}` }
      }

      return await res.json()
    } catch {
      return { results: [], total: 0, error: 'Could not reach CSlate server' }
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
            Authorization: `Bearer ${this.apiKey}`,
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
          headers: { Authorization: `Bearer ${this.apiKey}` },
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
        headers: { Authorization: `Bearer ${this.apiKey}` },
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
