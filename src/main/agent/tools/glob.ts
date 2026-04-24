import { z } from 'zod'
import { readdir } from 'fs/promises'
import { join, relative } from 'path'
import { buildTool, type CSTool } from './types'
import { safePath } from '../../lib/paths'

type GlobInput = { pattern: string; cwd?: string }
type GlobOutput = { files: string[] } | { error: string }

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true } as any)
  return (entries as any[])
    .filter((e: any) => e.isFile())
    .map((e: any) => join(e.parentPath ?? e.path ?? dir, e.name))
}

export function createGlobCSTool(projectDir: string): CSTool<GlobInput, GlobOutput> {
  return buildTool<GlobInput, GlobOutput>({
    name: 'glob',
    description:
      'Find files in the project by glob pattern. Returns paths relative to project root. Supports * (single dir level) and ** (recursive). E.g. "components/**/*.tsx", "**/*.ts".',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern, e.g. "components/**/*.tsx"'),
      cwd: z.string().optional().describe('Subdirectory to search from (relative to project root). Defaults to project root.'),
    }),
    call: async (input: GlobInput): Promise<{ data: GlobOutput }> => {
      let searchRoot: string
      try {
        searchRoot = input.cwd ? safePath(projectDir, input.cwd) : projectDir
      } catch {
        return { data: { error: `Invalid cwd: ${input.cwd}` } }
      }
      const regex = globToRegex(input.pattern)

      let allFiles: string[]
      try {
        allFiles = await walkDir(searchRoot)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Cannot read directory: ${msg}` } }
      }

      const matched = allFiles
        .map(f => relative(projectDir, f))
        .filter(f => regex.test(f))

      return { data: { files: matched } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}
