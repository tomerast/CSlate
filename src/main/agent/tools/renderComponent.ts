// src/main/agent/tools/renderComponent.ts
import type { Tool } from 'ai'
import { z } from 'zod'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentFiles } from '../lib/bundler'
import { stripFences } from '../lib/stripFences'
import { PlacementSchema, type Placement } from '../lib/canvasJson'

type RenderInput = {
  files: Record<string, string>
  manifest: unknown
  placement?: Placement
}

type RenderOutput = {
  success: boolean
  componentId: string
  bundle?: string
  files?: Record<string, string>
  manifest?: unknown
  placement?: Placement
  errors?: string[]
}

export function createRenderComponentTool(): Tool<RenderInput, RenderOutput> {
  return {
    description:
      'Preview a component on the canvas. Bundles all files with esbuild and renders ' +
      'the default export from ui.tsx. This is an ephemeral preview — call writeComponent to persist.',
    inputSchema: z.object({
      files: z.record(z.string()).describe(
        'Component files keyed by relative path. ui.tsx is required. ' +
        'May include any structure: "hooks/useData.ts", "components/Chart.tsx", etc.'
      ),
      manifest: z.any().describe('The ComponentManifest object'),
      placement: PlacementSchema.optional().describe('Where to place the preview on canvas.'),
    }) as any,
    execute: async (input: RenderInput): Promise<RenderOutput> => {
      const cleanFiles: Record<string, string> = {}
      for (const [path, content] of Object.entries(input.files)) {
        cleanFiles[path] = stripFences(content)
      }

      const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
      if (!validation.valid) {
        return { success: false, componentId: '', errors: validation.errors }
      }

      let bundle: string
      try {
        bundle = await bundleComponentFiles(cleanFiles)
      } catch (e) {
        return { success: false, componentId: '', errors: [e instanceof Error ? e.message : String(e)] }
      }

      const componentId = `preview_${Date.now()}`
      return { success: true, componentId, bundle, files: cleanFiles, manifest: input.manifest, placement: input.placement }
    },
  }
}
