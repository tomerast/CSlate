import { generateObject } from 'ai'
import { z } from 'zod'
import type { LLMConfig } from '@cslate/shared/agent'
import { fastModelId } from '@cslate/shared/agent'
import { engineLog } from '../lib/logger'

const RouteSchema = z.object({
  route: z.enum(['orchestrator', 'skill', 'direct']),
  skill: z.enum(['state-wirer', 'component-search', 'pipeline-wirer']).nullable(),
  summary: z.string(),
  targetComponentId: z.string().nullable(),
})

export type RouteResult = z.infer<typeof RouteSchema>

const ROUTER_SYSTEM = `You are the CSlate router. Classify the user's message into one of three routes:

- orchestrator: Any component work — building, modifying, styling, fixing, iterating on components. This includes explicit keywords ("build", "create", "add", "make", "update", "modify", "change", "fix", "restyle", "make it prettier", "I don't like") AND implicit feedback ("feedback on current result"). ALSO includes symptom descriptions when active components are listed — phrases like "it's stuck", "nothing loads", "the spinner won't stop", "it's not working", "nothing is showing", "it crashed", "I see an error", "why isn't it", "can you fix" — these are bug reports, not questions.
- skill: Cross-component operations that don't build/modify a single component:
  - state-wirer: "connect", "wire", "link", "when X updates Y", "share data between"
  - component-search: "find", "search", "show me components", "browse", "what components exist"
  - pipeline-wirer: "connect pipeline", "wire pipeline", "link pipeline to", "use pipeline in" — ONLY when wiring an EXISTING pipeline to an EXISTING component; building new pipelines routes to orchestrator
- direct: General questions, settings help, non-component tasks. Only use this when no active components are relevant and the message is clearly not about a component.

targetComponentId: the snake_case ID of an existing component being referenced. Null if creating new or not applicable.
summary: one sentence describing what to do.`

function buildContextualPrompt(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeComponentIds: string[]
): string {
  const parts: string[] = []

  if (activeComponentIds.length > 0) {
    parts.push(`Active components on canvas: ${activeComponentIds.join(', ')}`)
  }

  if (history.length > 0) {
    const recent = history.slice(-2)
    const historyLines = recent.map((m) => `${m.role}: ${m.content}`).join('\n')
    parts.push(`Recent conversation:\n${historyLines}`)
  }

  if (parts.length === 0) return message

  return `${parts.join('\n\n')}\n\nCurrent message: ${message}`
}

export async function classifyIntent(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeComponentIds: string[],
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
      prompt: buildContextualPrompt(message, history, activeComponentIds),
      schema: RouteSchema,
    })
    log.debug({ modelId, durationMs: Date.now() - t0, route: object.route }, 'classifyIntent done')
    return object
  } catch (err) {
    log.warn({ modelId, err }, 'classifyIntent failed, defaulting to orchestrator')
    return { route: 'orchestrator', skill: null, summary: message, targetComponentId: null }
  }
}
