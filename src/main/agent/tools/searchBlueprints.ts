import type { Tool } from 'ai'
import { z } from 'zod'
import type { CSlateServerClient } from '../../server/CSlateServerClient'

type SearchInput = { query: string; limit: number }
type SearchOutput = { results: unknown[]; error?: string }

export function createSearchBlueprintsTool(client: CSlateServerClient | null): Tool<SearchInput, SearchOutput> {
  return {
    description: 'Search the CSlate community database for existing component blueprints matching a description. Always search before building from scratch — a good blueprint saves iterations.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of the component you want to find'),
      limit: z.number().min(1).max(10).default(5),
    }) as any,
    execute: async (input: SearchInput): Promise<SearchOutput> => {
      if (!client) {
        return { results: [], error: 'Server not configured' }
      }
      const response = await client.search(input.query, input.limit)
      return { results: response.results, error: response.error }
    },
  }
}
