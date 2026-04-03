import type { ActionContext, ActionResult } from './index'
import { removeFromCanvasJson } from '../lib/canvasJson'

export async function clearCanvas(
  _params: Record<string, unknown>,
  ctx: ActionContext
): Promise<ActionResult> {
  if (ctx.activeComponents.length === 0) {
    return { message: 'The canvas is already empty.' }
  }

  const count = ctx.activeComponents.length
  for (const comp of ctx.activeComponents) {
    await removeFromCanvasJson(ctx.projectDir, comp.componentId)
  }

  ctx.sender.send('agent:action', {
    type: 'clear-canvas',
    componentIds: ctx.activeComponents.map(c => c.componentId),
  })

  return {
    message: `Removed all ${count} component${count > 1 ? 's' : ''} from the canvas. You can restore any of them from the Component History panel.`,
  }
}
