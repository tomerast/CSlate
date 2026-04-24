import type { WebContents } from 'electron'

export interface ActionContext {
  projectDir: string
  sender: WebContents
}

export interface ActionResult {
  message: string
}

export type ActionName = keyof typeof actionRegistry

/**
 * Direct actions — deterministic operations that don't need an LLM agent.
 * Intentionally empty post-canvas-retirement. New actions (regenerate-last,
 * fork-session) will be added in later phases.
 */
export const actionRegistry = {} as const satisfies Record<
  string,
  (params: Record<string, unknown>, ctx: ActionContext) => Promise<ActionResult>
>
