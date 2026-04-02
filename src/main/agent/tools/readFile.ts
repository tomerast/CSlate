import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createReadFileCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'readFile', description: 'stub', inputSchema: z.object({ path: z.string() }), call: async () => ({ data: { error: 'stub' } }) })
}
