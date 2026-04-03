import { z } from 'zod'
import { runStructuredAgent, fastModelId, type LLMConfig } from '@cslate/shared/agent'
import { engineLog } from '../lib/logger'

const RouteSchema = z.object({
  route: z.enum(['orchestrator', 'skill', 'direct']),
  skill: z.enum(['state-wirer', 'component-search', 'pipeline-wirer', 'component-fix']).nullable(),
  summary: z.string(),
  targetComponentId: z.string().nullable(),
})

export type RouteResult = z.infer<typeof RouteSchema>

const ROUTER_SYSTEM = `You are the CSlate router. Classify the user's message into one of three routes:

- orchestrator: Building NEW components from scratch. Keywords: "build", "create", "add", "make" (when no existing component is referenced).
- skill: Operations on existing components or cross-component work:
  - component-fix: Fixing, modifying, updating, restyling, or iterating on an EXISTING component on the canvas. This includes: "fix", "update", "modify", "change", "restyle", "make it prettier", "I don't like", AND symptom descriptions like "it's stuck", "nothing loads", "it's not working", "nothing is showing", "it crashed", "I see an error", "can you fix". Use this whenever the user references a specific active component or there is only one active component and the message is clearly about it. ALWAYS set targetComponentId.
  - state-wirer: "connect", "wire", "link", "when X updates Y", "share data between"
  - component-search: "find", "search", "show me components", "browse", "what components exist"
  - pipeline-wirer: "connect pipeline", "wire pipeline", "link pipeline to", "use pipeline in" — ONLY when wiring an EXISTING pipeline to an EXISTING component; building new pipelines routes to orchestrator
- direct: General questions, settings help, non-component tasks. Only use this when no active components are relevant and the message is clearly not about a component.

targetComponentId: the snake_case ID of an existing component being referenced. Null if creating new or not applicable.
summary: one sentence describing what to do.`

interface ComponentInfo {
  componentId: string
  name?: string
  description?: string
}

function buildContextualPrompt(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeComponents: ComponentInfo[]
): string {
  const parts: string[] = []

  if (activeComponents.length > 0) {
    const lines = activeComponents.map((c) => {
      const label = c.name || c.componentId.replace(/_/g, ' ')
      return c.description
        ? `- ${c.componentId} ("${label}"): ${c.description}`
        : `- ${c.componentId} ("${label}")`
    })
    parts.push(`Active components on canvas:\n${lines.join('\n')}`)
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
  activeComponents: ComponentInfo[],
  config: LLMConfig,
  registry: { languageModel: (id: string) => any }
): Promise<RouteResult> {
  const modelId = fastModelId(config)
  const log = engineLog.child({ component: 'router' })
  log.debug({ modelId, message }, 'classifyIntent start')
  const t0 = Date.now()

  try {
    const object = await runStructuredAgent({
      modelId,
      registry,
      system: ROUTER_SYSTEM,
      prompt: buildContextualPrompt(message, history, activeComponents),
      schema: RouteSchema,
    })
    log.debug({ modelId, durationMs: Date.now() - t0, route: object.route }, 'classifyIntent done')
    return object
  } catch (err) {
    log.warn({ modelId, err }, 'classifyIntent failed, defaulting to orchestrator')
    return { route: 'orchestrator', skill: null, summary: message, targetComponentId: null }
  }
}
