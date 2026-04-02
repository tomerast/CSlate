import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createWebFetchCSTool(_serverClient: any): CSTool {
  return buildTool({ name: 'webFetch', description: 'stub', inputSchema: z.object({ url: z.string().optional(), query: z.string().optional() }), call: async () => ({ data: { content: '', source: 'web' as const } }) })
}
