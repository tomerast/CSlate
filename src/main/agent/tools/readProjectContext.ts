import type { Tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import { readdirSync } from 'fs'
import { buildTool, type CSTool } from './types'

type ReadContextInput = { includeSourceSummaries: boolean }
type ReadContextOutput = { app: Record<string, unknown>; components: Record<string, unknown>[] }

export function createReadProjectContextCSTool(projectDir: string): CSTool<ReadContextInput, ReadContextOutput> {
  return buildTool({
    name: 'readProjectContext',
    description: 'Read the current project context: the app name/description and all component manifests rendered in the current conversation.',
    inputSchema: z.object({
      includeSourceSummaries: z.boolean().default(false).describe('Whether to include context.md summaries for each component'),
    }),
    call: async (input: ReadContextInput) => {
      const appManifestPath = join(projectDir, 'cslate.json')
      let appManifest: Record<string, unknown> = {}
      if (existsSync(appManifestPath)) {
        appManifest = JSON.parse(await readFile(appManifestPath, 'utf-8')) as Record<string, unknown>
      }

      const componentsDir = resolve(projectDir, 'components')
      const components: Record<string, unknown>[] = []
      if (existsSync(componentsDir)) {
        const dirs = readdirSync(componentsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)

        for (const name of dirs) {
          const componentDir = resolve(componentsDir, name)
          // Path traversal protection
          if (!componentDir.startsWith(componentsDir + sep)) {
            continue
          }
          const manifestPath = join(componentDir, 'manifest.json')
          if (!existsSync(manifestPath)) continue
          const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as unknown
          const entry: Record<string, unknown> = { componentId: name, manifest }
          if (input.includeSourceSummaries) {
            const contextPath = join(componentDir, 'context.md')
            if (existsSync(contextPath)) {
              entry.context = await readFile(contextPath, 'utf-8')
            }
          }
          components.push(entry)
        }
      }

      return { data: { app: appManifest, components } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    maxResultSizeChars: 100_000,
  })
}

/**
 * @deprecated Use createReadProjectContextCSTool() instead.
 * Kept for backward compatibility with code calling .execute().
 */
export function createReadProjectContextTool(projectDir: string): Tool<ReadContextInput, ReadContextOutput> {
  return createReadProjectContextCSTool(projectDir).toAISDKTool()
}
