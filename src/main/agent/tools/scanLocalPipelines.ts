import { z } from 'zod'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildTool } from './types'
import { safePath } from '../../lib/paths'

type MatchEntry = {
  pipelineId: string
  name: string
  description: string
  tags: string[]
  files: Record<string, string>
  score: number
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1),
  )
}

function scoreMatch(
  queryTokens: Set<string>,
  name: string,
  description: string,
  tags: string[],
): number {
  const targetText = `${name} ${description} ${tags.join(' ')}`
  const targetTokens = tokenize(targetText)
  let hits = 0
  for (const q of queryTokens) {
    for (const t of targetTokens) {
      if (t.includes(q) || q.includes(t)) {
        hits++
        break
      }
    }
  }
  return queryTokens.size > 0 ? hits / queryTokens.size : 0
}

const SOURCE_FILES = ['pipeline.ts', 'transform.ts', 'types.ts']

export function createScanLocalPipelinesTool() {
  return buildTool({
    name: 'scanLocalPipelines',
    description:
      'Scan local project pipelines for ones similar to a query. Used as fallback when server search has no results.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of what you are looking for'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ query }: { query: string }, context?) => {
      const projectDir = context?.projectDir ?? ''
      const pipelinesDir = resolve(projectDir, 'pipelines')

      if (!existsSync(pipelinesDir)) return { data: { matches: [] as MatchEntry[] } }

      const dirs = (await readdir(pipelinesDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)

      const queryTokens = tokenize(query)
      const scored: MatchEntry[] = []

      for (const dir of dirs) {
        let pipelineDir: string
        try {
          pipelineDir = safePath(pipelinesDir, dir)
        } catch {
          continue
        }

        const manifestPath = join(pipelineDir, 'manifest.json')
        if (!existsSync(manifestPath)) continue

        let manifest: Record<string, unknown>
        try {
          manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as Record<string, unknown>
        } catch {
          continue
        }

        const name = typeof manifest.name === 'string' ? manifest.name : dir
        const description = typeof manifest.description === 'string' ? manifest.description : ''
        const tags: string[] = Array.isArray(manifest.tags) ? (manifest.tags as string[]) : []

        const score = scoreMatch(queryTokens, name, description, tags)
        if (score < 0.3) continue

        const files: Record<string, string> = {}
        for (const file of SOURCE_FILES) {
          const filePath = join(pipelineDir, file)
          if (existsSync(filePath)) {
            files[file] = await readFile(filePath, 'utf-8')
          }
        }

        scored.push({ pipelineId: dir, name, description, tags, files, score })
      }

      scored.sort((a, b) => b.score - a.score)
      return { data: { matches: scored.slice(0, 5) } }
    },
  })
}
