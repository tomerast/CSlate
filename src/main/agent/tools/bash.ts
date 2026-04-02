import { z } from 'zod'
import { buildTool, type CSTool } from './types'
import { classifyCommand, type PermissionBroker } from './bash/permissions'
import { execute } from './bash/executor'
import { safePath } from '../../lib/paths'

type BashInput = { command: string; cwd?: string; timeout?: number }
type BashOutput =
  | { stdout: string; stderr: string; exitCode: number }
  | { error: string }

export function createBashCSTool(
  projectDir: string,
  broker: PermissionBroker
): CSTool<BashInput, BashOutput> {
  return buildTool<BashInput, BashOutput>({
    name: 'bash',
    description:
      'Run a shell command in the project directory. Safe commands (tsc, eslint, git status) run immediately. Destructive commands prompt the user for approval. Commands writing outside the project directory are auto-denied.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().optional().describe('Working directory relative to project root (defaults to project root)'),
      timeout: z.number().int().min(1000).max(120_000).optional().describe('Timeout in ms (default 30000, max 120000)'),
    }),
    call: async (input: BashInput, context): Promise<{ data: BashOutput }> => {
      const decision = classifyCommand(input.command)

      if (decision === 'deny') {
        return { data: { error: `Command denied: "${input.command}" is not permitted.` } }
      }

      if (decision === 'prompt') {
        const approved = await broker.request(input.command)
        if (!approved) {
          return { data: { error: `Command denied by user: "${input.command}"` } }
        }
      }

      let cwd: string
      if (input.cwd) {
        try {
          cwd = safePath(projectDir, input.cwd)
        } catch {
          return { data: { error: `Invalid cwd: ${input.cwd}` } }
        }
      } else {
        cwd = projectDir
      }
      const timeout = input.timeout ?? 30_000

      try {
        const result = await execute({
          command: input.command,
          cwd,
          timeout,
          abortSignal: context?.abortSignal,
        })
        return { data: result }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: msg } }
      }
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    maxResultSizeChars: 100_000,
  })
}
