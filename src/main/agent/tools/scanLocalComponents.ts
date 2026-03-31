import type { Tool } from 'ai'
import { z } from 'zod'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

type ScanInput = { query: string }
type MatchEntry = {
  componentId: string
  name: string
  description: string
  tags: string[]
  source: Record<string, string>
  score: number
}
type ScanOutput = { matches: MatchEntry[] }

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1)
  )
}

function scoreMatch(queryTokens: Set<string>, name: string, description: string, tags: string[]): number {
  const targetText = `${name} ${description} ${tags.join(' ')}`
  const targetTokens = tokenize(targetText)
  let hits = 0
  for (const q of queryTokens) {
    for (const t of targetTokens) {
      if (t.includes(q) || q.includes(t)) { hits++; break }
    }
  }
  return queryTokens.size > 0 ? hits / queryTokens.size : 0
}

const SOURCE_FILES = ['ui.tsx', 'logic.ts', 'types.ts']

export function createScanLocalComponentsTool(projectDir: string): Tool<ScanInput, ScanOutput> {
  return {
    description: 'Scan local project components for ones similar to a query. Used as fallback when server search has no results.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of what you are looking for'),
    }) as any,
    execute: async (input: ScanInput): Promise<ScanOutput> => {
      const componentsDir = resolve(projectDir, 'components')
      if (!existsSync(componentsDir)) return { matches: [] }

      const dirs = (await readdir(componentsDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name)

      const queryTokens = tokenize(input.query)
      const scored: MatchEntry[] = []

      for (const dir of dirs) {
        const compDir = resolve(componentsDir, dir)
        if (!compDir.startsWith(componentsDir + '/')) continue
        const manifestPath = join(compDir, 'manifest.json')
        if (!existsSync(manifestPath)) continue

        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
        const name = manifest.name ?? dir
        const description = manifest.description ?? ''
        const tags: string[] = manifest.tags ?? []

        const score = scoreMatch(queryTokens, name, description, tags)
        if (score < 0.3) continue

        const source: Record<string, string> = {}
        for (const file of SOURCE_FILES) {
          const filePath = join(compDir, file)
          if (existsSync(filePath)) {
            source[file] = await readFile(filePath, 'utf-8')
          }
        }

        scored.push({ componentId: dir, name, description, tags, source, score })
      }

      scored.sort((a, b) => b.score - a.score)
      return { matches: scored.slice(0, 5) }
    },
  }
}
