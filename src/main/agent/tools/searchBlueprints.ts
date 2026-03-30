import type { Tool } from 'ai'
import { z } from 'zod'

type SearchInput = { query: string; limit: number }
type SearchOutput = { results: unknown[]; error?: string }

export function createSearchBlueprintsTool(serverUrl: string, serverApiKey: string): Tool<SearchInput, SearchOutput> {
  return {
    description: 'Search the CSlate community database for existing component blueprints matching a description. Always search before building from scratch — a good blueprint saves iterations.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of the component you want to find'),
      limit: z.number().min(1).max(10).default(5),
    }) as any,
    execute: async (input: SearchInput): Promise<SearchOutput> => {
      try {
        const url = new URL('/api/components/search', serverUrl)
        url.searchParams.set('q', input.query)
        url.searchParams.set('limit', String(input.limit))
        const res = await fetch(url.toString(), {
          headers: { Authorization: `ApiKey ${serverApiKey}` },
        })
        if (!res.ok) return { results: [], error: `Server returned ${res.status}` }
        return await res.json() as SearchOutput
      } catch {
        return { results: [], error: 'Could not reach CSlate server' }
      }
    },
  }
}
