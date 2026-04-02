import { buildTool, type CSTool } from './types'
import { z } from 'zod'
import type { PermissionBroker } from './bash/permissions'
export function createBashCSTool(_projectDir: string, _broker: PermissionBroker): CSTool {
  return buildTool({ name: 'bash', description: 'stub', inputSchema: z.object({ command: z.string() }), call: async () => ({ data: { stdout: '', stderr: '', exitCode: 0 } }) })
}
