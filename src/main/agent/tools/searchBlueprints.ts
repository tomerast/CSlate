import { tool } from 'ai'
import { z } from 'zod'

export function createSearchBlueprintsTool(serverUrl: string, serverApiKey: string) {
  return tool({
    description: 'Search the CSlate community database for existing component blueprints matching a description. Always search before building from scratch — a good blueprint saves iterations.',
    parameters: z.object({
      query: z.string().describe('Natural language description of the component you want to find'),
      limit: z.number().min(1).max(10).default(5),
    }),
    execute: async ({ query, limit }) => {
      try {
        const url = new URL('/api/components/search', serverUrl)
        url.searchParams.set('q', query)
        url.searchParams.set('limit', String(limit))
        const res = await fetch(url.toString(), {
          headers: { Authorization: `ApiKey ${serverApiKey}` },
        })
        if (!res.ok) return { results: [], error: `Server returned ${res.status}` }
        return await res.json()
      } catch {
        return { results: [], error: 'Could not reach CSlate server' }
      }
    },
  })
}
