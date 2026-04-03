// src/main/agent/tools/writeComponent.ts
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join, resolve, sep, dirname } from 'path'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentDir } from '../lib/bundler'
import { PlacementSchema, readCanvasJson, updateCanvasJson, type Placement } from '../lib/canvasJson'
import { solvePlacement } from '../lib/placementSolver'
import { stripFences } from '@cslate/shared/agent'
import { buildTool } from './types'

type WriteInput = {
  componentId: string
  files: Record<string, string>
  manifest: Record<string, unknown>
  placement?: Placement
  republish?: boolean
}

type WriteOutput = {
  success: boolean
  path: string
  componentId?: string
  bundle?: string
  placement?: Placement
  manifest?: unknown
  files?: Record<string, string>
  republish?: boolean
  errors?: string[]
}

export function createWriteComponentTool(projectDir: string) {
  return buildTool<WriteInput, WriteOutput>({
    name: 'writeComponent',
    description:
      'Save a component package to disk and place it on the canvas permanently. ' +
      'Writes source files, builds bundle.js, and updates canvas.json. ' +
      'Only call after validateManifest returns valid=true.',
    inputSchema: z.object({
      componentId: z.string()
        .regex(/^[a-z0-9][a-z0-9_-]*$/)
        .describe('lowercase identifier, e.g. "weather_widget"'),
      files: z.record(z.string()).describe(
        'All component files by relative path. ui.tsx required. ' +
        'Include any structure. Include "context.md" as a file.'
      ),
      manifest: z.any().describe('The validated ComponentManifest object'),
      placement: PlacementSchema.optional().describe('Where to place on canvas.'),
      republish: z.boolean().optional().describe(
        'Whether this update should be shared with the community. ' +
        'true for new components and bug fixes, false for minor visual tweaks. Defaults to true.'
      ),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async (input: WriteInput) => {
      // 1. Path containment
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return { data: { success: false, path: '', errors: ['Invalid componentId: path traversal'] } }
      }

      // 2. Strip fences
      const cleanFiles: Record<string, string> = {}
      for (const [filePath, content] of Object.entries(input.files)) {
        cleanFiles[filePath] = stripFences(content)
      }

      // 3. Validate package
      const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
      if (!validation.valid) {
        return { data: { success: false, path: '', errors: validation.errors } }
      }

      // 4. Write source files
      await mkdir(componentDir, { recursive: true })
      await writeFile(join(componentDir, 'manifest.json'), JSON.stringify(input.manifest, null, 2), 'utf-8')
      await Promise.all(
        Object.entries(cleanFiles).map(async ([filePath, content]) => {
          const target = join(componentDir, filePath)
          if (!target.startsWith(componentDir + sep)) {
            throw new Error(`Path traversal in files: "${filePath}"`)
          }
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, content, 'utf-8')
        })
      )

      // 5. Bundle from written source
      let bundle: string
      try {
        bundle = await bundleComponentDir(componentDir)
      } catch (e) {
        return { data: { success: false, path: componentDir, errors: [e instanceof Error ? e.message : String(e)] } }
      }

      // 6. Write bundle.js
      await writeFile(join(componentDir, 'bundle.js'), bundle, 'utf-8')

      // 7. Calculate placement — use smart solver if no explicit placement
      const layout = input.manifest.layout as { minWidth?: number; minHeight?: number } | undefined
      const defaultSize = input.manifest.defaultSize as { width?: number; height?: number } | undefined
      const componentWidth = defaultSize?.width ?? layout?.minWidth ?? 50
      const componentHeight = defaultSize?.height ?? layout?.minHeight ?? 25
      let placement: Placement
      if (input.placement) {
        placement = input.placement
      } else {
        const canvas = await readCanvasJson(projectDir)
        const existingPlacements = canvas.components.map((c) => ({ id: c.componentId, ...c.placement }))

        const { readFile } = await import('fs/promises')
        const existingManifests: Array<{ id: string; tags: string[]; description: string }> = []
        for (const entry of canvas.components) {
          try {
            const manifestRaw = await readFile(
              join(resolve(projectDir, 'components'), entry.componentId, 'manifest.json'),
              'utf-8',
            )
            const m = JSON.parse(manifestRaw)
            existingManifests.push({
              id: entry.componentId,
              tags: Array.isArray(m.tags) ? m.tags : [],
              description: typeof m.description === 'string' ? m.description : '',
            })
          } catch {
            existingManifests.push({ id: entry.componentId, tags: [], description: '' })
          }
        }

        const pos = solvePlacement(
          {
            tags: Array.isArray(input.manifest.tags) ? input.manifest.tags as string[] : [],
            description: typeof input.manifest.description === 'string' ? input.manifest.description as string : '',
          },
          { width: componentWidth, height: componentHeight },
          existingPlacements,
          existingManifests,
        )
        placement = { ...pos, width: componentWidth, height: componentHeight }
      }
      await updateCanvasJson(projectDir, input.componentId, placement)

      return {
        data: {
          success: true,
          path: componentDir,
          componentId: input.componentId,
          bundle,
          placement,
          manifest: input.manifest,
          files: cleanFiles,
          republish: input.republish ?? true,
        }
      }
    },
  })
}
