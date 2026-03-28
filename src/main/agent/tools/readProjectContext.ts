import { tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { readdirSync } from 'fs'

export function createReadProjectContextTool(projectDir: string) {
  return tool({
    description: 'Read the current project context: the app name/description and all component manifests currently on the canvas.',
    parameters: z.object({
      includeSourceSummaries: z.boolean().default(false).describe('Whether to include context.md summaries for each component'),
    }),
    execute: async ({ includeSourceSummaries }) => {
      const appManifestPath = join(projectDir, 'cslate.json')
      let appManifest: Record<string, unknown> = {}
      if (existsSync(appManifestPath)) {
        appManifest = JSON.parse(await readFile(appManifestPath, 'utf-8'))
      }

      const componentsDir = join(projectDir, 'components')
      const components: Record<string, unknown>[] = []
      if (existsSync(componentsDir)) {
        const dirs = readdirSync(componentsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)

        for (const name of dirs) {
          const manifestPath = join(componentsDir, name, 'manifest.json')
          if (!existsSync(manifestPath)) continue
          const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
          const entry: Record<string, unknown> = { componentId: name, manifest }
          if (includeSourceSummaries) {
            const contextPath = join(componentsDir, name, 'context.md')
            if (existsSync(contextPath)) {
              entry.context = await readFile(contextPath, 'utf-8')
            }
          }
          components.push(entry)
        }
      }

      return { app: appManifest, components }
    },
  })
}
