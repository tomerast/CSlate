import type { Tool } from 'ai'
import { z } from 'zod'
import type { WebContents } from 'electron'
import { stripFences } from '../lib/stripFences'

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

const PlacementSchema = z.object({
  x: z.number().describe('Grid units from left'),
  y: z.number().describe('Grid units from top'),
  width: z.number().describe('Width in grid units (1 unit = 8px)'),
  height: z.number().describe('Height in grid units'),
})

type FilesInput = z.infer<typeof FilesSchema>
type PlacementInput = z.infer<typeof PlacementSchema>
type RenderInput = { files: FilesInput; manifest: unknown; placement?: PlacementInput }
type RenderOutput = { success: boolean; componentId: string }

export function createRenderComponentTool(sender: WebContents, tabId: string): Tool<RenderInput, RenderOutput> {
  return {
    description: 'Render a generated component in the sandbox iframe on the Slate canvas. Call this to show the component to the user. The component will appear immediately.',
    inputSchema: z.object({
      files: FilesSchema,
      manifest: z.any().describe('The ComponentManifest object'),
      placement: PlacementSchema.optional().describe('Where to place the component on the canvas. Omit to auto-place.'),
    }) as any,
    execute: async (input: RenderInput): Promise<RenderOutput> => {
      const componentId = `comp_${Date.now()}`
      const cleanFiles = {
        'ui.tsx': stripFences(input.files['ui.tsx']),
        ...(input.files['logic.ts'] ? { 'logic.ts': stripFences(input.files['logic.ts']!) } : {}),
        ...(input.files['types.ts'] ? { 'types.ts': stripFences(input.files['types.ts']!) } : {}),
      }
      sender.send('sandbox:load', { tabId, componentId, files: cleanFiles, manifest: input.manifest, placement: input.placement })
      return { success: true, componentId }
    },
  }
}
