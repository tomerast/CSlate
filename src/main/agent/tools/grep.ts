import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createGrepCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'grep', description: 'stub', inputSchema: z.object({ pattern: z.string() }), call: async () => ({ data: { matches: [] } }) })
}
