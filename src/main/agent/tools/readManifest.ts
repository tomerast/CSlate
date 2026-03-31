import type { Tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'

type ReadManifestInput = { componentId: string }
type ReadManifestOutput = { manifest: unknown } | { error: string }

export function createReadManifestTool(projectDir: string): Tool<ReadManifestInput, ReadManifestOutput> {
  return {
    description: 'Read the manifest.json for a component that already exists in the project.',
    inputSchema: z.object({
      componentId: z.string().describe('The component directory name, e.g. "stock_ticker"'),
    }) as any,
    execute: async (input: ReadManifestInput): Promise<ReadManifestOutput> => {
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return { error: 'Invalid component ID' }
      }
      const manifestPath = join(componentDir, 'manifest.json')
      if (!existsSync(manifestPath)) {
        return { error: `Component "${input.componentId}" not found` }
      }
      const raw = await readFile(manifestPath, 'utf-8')
      return { manifest: JSON.parse(raw) as unknown }
    },
  }
}
