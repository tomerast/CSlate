import type { Tool } from 'ai'
import { z } from 'zod'
import type { CSlateServerClient } from '../../server/CSlateServerClient'
import { buildTool, type CSTool } from './types'

type SearchInput = { query: string; limit: number }
type SearchOutput = { results: unknown[]; error?: string }

function createSearchBlueprintsCSTool(client: CSlateServerClient | null): CSTool<SearchInput, SearchOutput> {
  return buildTool<SearchInput, SearchOutput>({
    name: 'searchBlueprints',
    description: 'Search the CSlate community database for existing component blueprints matching a description. Always search before building from scratch — a good blueprint saves iterations.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of the component you want to find'),
      limit: z.number().min(1).max(10).default(5),
    }),
    call: async (input: SearchInput): Promise<{ data: SearchOutput }> => {
      if (!client) {
        return { data: { results: [], error: 'Server not configured' } }
      }
      const response = await client.search(input.query, input.limit)
      return { data: { results: response.results, error: response.error } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}

/**
 * @deprecated Use createSearchBlueprintsCSTool() instead.
 * Kept for backward compatibility with code calling .execute().
 */
export function createSearchBlueprintsTool(client: CSlateServerClient | null): Tool<SearchInput, SearchOutput> {
  return createSearchBlueprintsCSTool(client).toAISDKTool()
}
