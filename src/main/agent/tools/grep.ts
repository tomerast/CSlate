import { z } from 'zod'
import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'
import { buildTool, type CSTool } from './types'
import { safePath } from '../../lib/paths'

type GrepInput = {
  pattern: string
  path?: string
  glob?: string
  caseInsensitive?: boolean
}
type GrepMatch = { file: string; line: number; content: string }
type GrepOutput = { matches: GrepMatch[] } | { error: string }

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true } as any)
  return (entries as any[])
    .filter((e: any) => e.isFile())
    .map((e: any) => join(e.parentPath ?? e.path ?? dir, e.name))
}

function matchesGlob(filePath: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
  return new RegExp(`(^|/)${escaped}$`).test(filePath)
}

export function createGrepCSTool(projectDir: string): CSTool<GrepInput, GrepOutput> {
  return buildTool<GrepInput, GrepOutput>({
    name: 'grep',
    description:
      'Search for a regex pattern across files in the project. Returns file path, line number, and matching line content. Use glob to filter file types (e.g. "*.tsx").',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Subdirectory to scope search (relative to project root)'),
      glob: z.string().optional().describe('Glob pattern to filter files, e.g. "*.ts" or "**/*.tsx"'),
      caseInsensitive: z.boolean().optional().describe('Case-insensitive matching'),
    }),
    call: async (input: GrepInput): Promise<{ data: GrepOutput }> => {
      let searchRoot: string
      try {
        searchRoot = input.path ? safePath(projectDir, input.path) : projectDir
      } catch {
        return { data: { error: `Invalid path: ${input.path}` } }
      }

      let regex: RegExp
      try {
        regex = new RegExp(input.pattern, input.caseInsensitive ? 'i' : '')
      } catch {
        return { data: { error: `Invalid regex: ${input.pattern}` } }
      }

      let files: string[]
      try {
        files = await walkDir(searchRoot)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Cannot read directory: ${msg}` } }
      }

      if (input.glob) {
        files = files.filter(f => matchesGlob(relative(searchRoot, f), input.glob!))
      }

      const matches: GrepMatch[] = []
      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push({
                file: relative(projectDir, filePath),
                line: i + 1,
                content: lines[i].trim(),
              })
            }
          }
        } catch {
          // Skip unreadable files (binary, permissions)
        }
      }

      return { data: { matches } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}
