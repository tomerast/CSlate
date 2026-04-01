import type { Tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import { buildTool, type CSTool } from './types'

type ReadManifestInput = { componentId: string }
type ReadManifestOutput = { manifest: unknown } | { error: string }

export function createReadManifestCSTool(projectDir: string): CSTool<ReadManifestInput, ReadManifestOutput> {
  return buildTool<ReadManifestInput, ReadManifestOutput>({
    name: 'readManifest',
    description: 'Read the manifest.json for a component that already exists in the project.',
    inputSchema: z.object({
      componentId: z.string().describe('The component directory name, e.g. "stock_ticker"'),
    }),
    call: async (input: ReadManifestInput): Promise<{ data: ReadManifestOutput }> => {
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return { data: { error: 'Invalid component ID' } }
      }
      const manifestPath = join(componentDir, 'manifest.json')
      if (!existsSync(manifestPath)) {
        return { data: { error: `Component "${input.componentId}" not found` } }
      }
      const raw = await readFile(manifestPath, 'utf-8')
      return { data: { manifest: JSON.parse(raw) as unknown } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}

/**
 * @deprecated Use createReadManifestCSTool() instead.
 * Kept for backward compatibility with code calling .execute().
 */
export function createReadManifestTool(projectDir: string): Tool<ReadManifestInput, ReadManifestOutput> {
  return createReadManifestCSTool(projectDir).toAISDKTool()
}
