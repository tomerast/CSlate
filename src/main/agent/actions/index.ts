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
 * Intentionally empty until deterministic chat/session actions are needed.
 */
export const actionRegistry = {} as const satisfies Record<
  string,
  (params: Record<string, unknown>, ctx: ActionContext) => Promise<ActionResult>
>
