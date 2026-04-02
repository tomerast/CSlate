import { z } from 'zod'
import { readFile as fsReadFile } from 'fs/promises'
import { buildTool, type CSTool } from './types'
import { safePath } from '../../lib/paths'

type ReadFileInput = {
  path: string
  lineRange?: { start: number; end: number }
}
type ReadFileOutput = { content: string } | { error: string }

export function createReadFileCSTool(projectDir: string): CSTool<ReadFileInput, ReadFileOutput> {
  return buildTool<ReadFileInput, ReadFileOutput>({
    name: 'readFile',
    description:
      'Read any file within the project directory. Use path relative to the project root (e.g. "components/foo/ui.tsx"). Optionally scope to a line range.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to project root'),
      lineRange: z
        .object({ start: z.number().int().min(1), end: z.number().int().min(1) })
        .optional()
        .describe('1-indexed inclusive line range to read'),
    }),
    call: async (input: ReadFileInput): Promise<{ data: ReadFileOutput }> => {
      let resolved: string
      try {
        resolved = safePath(projectDir, input.path)
      } catch {
        return { data: { error: `Invalid path: ${input.path}` } }
      }

      let content: string
      try {
        content = await fsReadFile(resolved, 'utf-8')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Cannot read file: ${msg}` } }
      }

      if (input.lineRange) {
        const lines = content.split('\n')
        const start = Math.max(0, input.lineRange.start - 1)
        const end = Math.min(lines.length, input.lineRange.end)
        content = lines.slice(start, end).join('\n')
      }

      return { data: { content } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    maxResultSizeChars: 100_000,
  })
}
