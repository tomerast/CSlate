import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createLspCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'lsp', description: 'stub', inputSchema: z.object({ files: z.array(z.string()).optional() }), call: async () => ({ data: { diagnostics: [] } }) })
}
