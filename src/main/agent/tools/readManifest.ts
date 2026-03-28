import type { Tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

type ReadManifestInput = { componentId: string }
type ReadManifestOutput = { manifest: unknown } | { error: string }

export function createReadManifestTool(projectDir: string): Tool<ReadManifestInput, ReadManifestOutput> {
  return {
    description: 'Read the manifest.json for a component that already exists in the project.',
    inputSchema: z.object({
      componentId: z.string().describe('The component directory name, e.g. "stock_ticker"'),
    }) as any,
    execute: async (input: ReadManifestInput): Promise<ReadManifestOutput> => {
      const manifestPath = join(projectDir, 'components', input.componentId, 'manifest.json')
      if (!existsSync(manifestPath)) {
        return { error: `Component "${input.componentId}" not found` }
      }
      const raw = await readFile(manifestPath, 'utf-8')
      return { manifest: JSON.parse(raw) as unknown }
    },
  }
}
