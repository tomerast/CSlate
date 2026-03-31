// src/main/agent/tools/writeComponent.ts
import type { Tool } from 'ai'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join, resolve, sep, dirname } from 'path'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentDir } from '../lib/bundler'
import { updateCanvasJson, type Placement } from '../lib/canvasJson'
import { stripFences } from '../lib/stripFences'

const PlacementSchema = z.object({
  x: z.number().describe('Grid units from left'),
  y: z.number().describe('Grid units from top'),
  width: z.number().describe('Width in grid units (1 unit = 8px)'),
  height: z.number().describe('Height in grid units'),
})

type WriteInput = {
  componentId: string
  files: Record<string, string>
  manifest: Record<string, unknown>
  placement?: Placement
}

type WriteOutput = {
  success: boolean
  path: string
  componentId?: string
  bundle?: string
  placement?: Placement
  manifest?: unknown
  errors?: string[]
}

export function createWriteComponentTool(projectDir: string): Tool<WriteInput, WriteOutput> {
  return {
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
    }) as any,
    execute: async (input: WriteInput): Promise<WriteOutput> => {
      // 1. Path containment
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return { success: false, path: '', errors: ['Invalid componentId: path traversal'] }
      }

      // 2. Strip fences
      const cleanFiles: Record<string, string> = {}
      for (const [filePath, content] of Object.entries(input.files)) {
        cleanFiles[filePath] = stripFences(content)
      }

      // 3. Validate package
      const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
      if (!validation.valid) {
        return { success: false, path: '', errors: validation.errors }
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
        return { success: false, path: componentDir, errors: [e instanceof Error ? e.message : String(e)] }
      }

      // 6. Write bundle.js
      await writeFile(join(componentDir, 'bundle.js'), bundle, 'utf-8')

      // 7. Update canvas.json
      const placement: Placement = input.placement ?? {
        x: 0,
        y: 0,
        width: (input.manifest as any)?.defaultSize?.width ?? 30,
        height: (input.manifest as any)?.defaultSize?.height ?? 25,
      }
      await updateCanvasJson(projectDir, input.componentId, placement)

      return {
        success: true,
        path: componentDir,
        componentId: input.componentId,
        bundle,
        placement,
        manifest: input.manifest,
      }
    },
  }
}
