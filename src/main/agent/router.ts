import { generateObject } from 'ai'
import { z } from 'zod'
import type { LLMConfig } from './providers'
import { fastModelId } from './providers'
import { engineLog } from '../lib/logger'

const RouteSchema = z.object({
  route: z.enum(['orchestrator', 'skill', 'direct']),
  skill: z.enum(['state-wirer', 'component-search']).nullable(),
  summary: z.string(),
  targetComponentId: z.string().nullable(),
})

export type RouteResult = z.infer<typeof RouteSchema>

const ROUTER_SYSTEM = `You are the CSlate router. Classify the user's message into one of three routes:

- orchestrator: Any component work — building, modifying, styling, fixing, iterating on components. This includes: "build", "create", "add", "make", "update", "modify", "change", "fix", "restyle", "make it prettier", "I don't like", feedback on current result, etc.
- skill: Cross-component operations that don't build/modify a single component:
  - state-wirer: "connect", "wire", "link", "when X updates Y", "share data between"
  - component-search: "find", "search", "show me components", "browse", "what components exist"
- direct: General questions, settings help, non-component tasks.

targetComponentId: the snake_case ID of an existing component being referenced. Null if creating new or not applicable.
summary: one sentence describing what to do.`

export async function classifyIntent(
  message: string,
  config: LLMConfig,
  registry: { languageModel: (id: string) => any }
): Promise<RouteResult> {
  const modelId = fastModelId(config)
  const log = engineLog.child({ component: 'router' })
  log.debug({ modelId, message }, 'classifyIntent start')
  const t0 = Date.now()

  try {
    const { object } = await generateObject({
      model: registry.languageModel(modelId),
      system: ROUTER_SYSTEM,
      prompt: message,
      schema: RouteSchema,
    })
    log.debug({ modelId, durationMs: Date.now() - t0, route: object.route }, 'classifyIntent done')
    return object
  } catch (err) {
    log.warn({ modelId, err }, 'classifyIntent failed, defaulting to orchestrator')
    return { route: 'orchestrator', skill: null, summary: message, targetComponentId: null }
  }
}
