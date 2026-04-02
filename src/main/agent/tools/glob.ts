import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createGlobCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'glob', description: 'stub', inputSchema: z.object({ pattern: z.string() }), call: async () => ({ data: { files: [] } }) })
}
