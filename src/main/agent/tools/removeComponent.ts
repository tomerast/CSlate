import { z } from 'zod'
import { removeFromCanvasJson } from '../lib/canvasJson'
import { buildTool } from './types'

type RemoveInput = {
  componentIds: string[]
}

type RemoveOutput = {
  removed: string[]
}

export function createRemoveComponentTool(projectDir: string) {
  return buildTool<RemoveInput, RemoveOutput>({
    name: 'removeComponent',
    description:
      'Remove one or more components from the canvas. ' +
      'Files stay on disk — the user can restore from component history.',
    inputSchema: z.object({
      componentIds: z.array(z.string()).describe(
        'Component IDs to remove from canvas. Pass ["*"] to remove all.'
      ),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async (input: RemoveInput) => {
      const { readCanvasJson } = await import('../lib/canvasJson')
      const canvas = await readCanvasJson(projectDir)
      const allIds = canvas.components.map(c => c.componentId)

      const idsToRemove = input.componentIds.includes('*')
        ? allIds
        : input.componentIds.filter(id => allIds.includes(id))

      for (const id of idsToRemove) {
        await removeFromCanvasJson(projectDir, id)
      }

      return { data: { removed: idsToRemove } }
    },
  })
}
