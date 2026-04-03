import type { ActionContext, ActionResult } from './index'
import { removeFromCanvasJson } from '../lib/canvasJson'

export async function removeComponent(
  params: Record<string, unknown>,
  ctx: ActionContext
): Promise<ActionResult> {
  const targetId = params.targetComponentId as string | undefined
  if (!targetId) {
    return { message: "I'm not sure which component to remove. Can you specify which one?" }
  }

  const exists = ctx.activeComponents.some(c => c.componentId === targetId)
  if (!exists) {
    return { message: `Component "${targetId}" isn't on the canvas.` }
  }

  await removeFromCanvasJson(ctx.projectDir, targetId)
  ctx.sender.send('agent:action', { type: 'remove-component', componentId: targetId })

  const manifest = ctx.activeComponents.find(c => c.componentId === targetId)?.manifest as Record<string, unknown> | undefined
  const name = (manifest?.name as string) || targetId.replace(/_/g, ' ')

  return {
    message: `Removed "${name}" from the canvas. You can restore it anytime from the Component History panel.`,
  }
}
