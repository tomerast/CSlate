import type { Tool } from './types'

// v1: queries CSlate server search API
export class SearchBlueprintsTool implements Tool {
  name = 'search_blueprints'
  description = 'Search the CSlate community library for existing component blueprints'
  inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' }
    },
    required: ['query']
  }

  async execute(_input: unknown, _projectDir: string | null): Promise<unknown> {
    // v1: call GET /api/components/search?q=<query>
    return { results: [], message: 'Blueprint search not yet implemented' }
  }
}
