import type { WebContents } from 'electron'
import { removeComponent } from './remove-component'
import { clearCanvas } from './clear-canvas'

export interface ActionContext {
  projectDir: string
  sender: WebContents
  activeComponents: Array<{ componentId: string; manifest: unknown }>
}

export interface ActionResult {
  message: string
}

export type ActionName = keyof typeof actionRegistry

/** Direct actions — deterministic operations that don't need an LLM agent. */
export const actionRegistry = {
  'remove-component': removeComponent,
  'clear-canvas': clearCanvas,
} as const satisfies Record<string, (params: Record<string, unknown>, ctx: ActionContext) => Promise<ActionResult>>
