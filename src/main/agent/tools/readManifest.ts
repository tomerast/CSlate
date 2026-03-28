import { tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export function createReadManifestTool(projectDir: string) {
  return tool({
    description: 'Read the manifest.json for a component that already exists in the project.',
    parameters: z.object({
      componentId: z.string().describe('The component directory name, e.g. "stock_ticker"'),
    }),
    execute: async ({ componentId }) => {
      const manifestPath = join(projectDir, 'components', componentId, 'manifest.json')
      if (!existsSync(manifestPath)) {
        return { error: `Component "${componentId}" not found` }
      }
      const raw = await readFile(manifestPath, 'utf-8')
      return { manifest: JSON.parse(raw) }
    },
  })
}
