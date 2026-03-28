import { tool } from 'ai'
import { z } from 'zod'
import type { WebContents } from 'electron'

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

export function createRenderComponentTool(sender: WebContents, tabId: string) {
  return tool({
    description: 'Render a generated component in the sandbox iframe on the Slate canvas. Call this to show the component to the user. The component will appear immediately.',
    parameters: z.object({
      files: FilesSchema,
      manifest: z.unknown().describe('The ComponentManifest object'),
      placement: z.object({
        x: z.number().describe('Grid units from left'),
        y: z.number().describe('Grid units from top'),
        width: z.number().describe('Width in grid units (1 unit = 8px)'),
        height: z.number().describe('Height in grid units'),
      }).optional().describe('Where to place the component on the canvas. Omit to auto-place.'),
    }),
    execute: async ({ files, manifest, placement }) => {
      const componentId = `comp_${Date.now()}`
      sender.send('sandbox:load', { tabId, componentId, files, manifest, placement })
      return { success: true, componentId }
    },
  })
}
