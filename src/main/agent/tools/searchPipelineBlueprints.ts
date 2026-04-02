import { z } from 'zod'
import { buildTool, type ToolResult } from './types'
import type { CSlateServerClient } from '../../server/CSlateServerClient'

type SearchPipelinesInput = { query: string; limit?: number }
type SearchPipelinesOutput = { results: unknown[]; total: number; source: string; message?: string }

export function createSearchPipelineBlueprintsTool(
  serverClient: CSlateServerClient | null,
) {
  return buildTool<SearchPipelinesInput, SearchPipelinesOutput>({
    name: 'searchPipelineBlueprints',
    description:
      'Search the CSlate server catalog for existing pipeline blueprints. Falls back gracefully if server is unavailable.',
    inputSchema: z.object({
      query: z.string().describe('Search query (e.g. "stock prices yahoo finance")'),
      limit: z.number().int().min(1).max(20).optional().describe('Max results (default 5)'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ query, limit = 5 }): Promise<ToolResult<SearchPipelinesOutput>> => {
      if (!serverClient) {
        return {
          data: {
            results: [] as unknown[],
            total: 0,
            source: 'none',
            message: 'CSlate server not configured. Use scanLocalPipelines for local search.',
          },
        }
      }

      try {
        const response = await serverClient.searchPipelines(query, limit)
        return {
          data: {
            results: response.results,
            total: response.total,
            source: 'server',
          },
        }
      } catch (err) {
        return {
          data: {
            results: [] as unknown[],
            total: 0,
            source: 'error',
            message: `Server search failed: ${(err as Error).message}. Use scanLocalPipelines for local search.`,
          },
        }
      }
    },
  })
}
