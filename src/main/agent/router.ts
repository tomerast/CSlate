import { z } from 'zod'
import { runStructuredAgent, fastModelId, type LLMConfig } from '@cslate/shared/agent'
import { engineLog } from '../lib/logger'

/**
 * Chat-portal routing taxonomy.
 *
 * - render: The user asked an informational question that benefits from a
 *   live visualization (chart, table, map, timeline, comparison, stats card,
 *   diagram). Example: "show me tesla this week", "how's my portfolio",
 *   "compare python vs rust".
 * - build: The user explicitly asked to build or modify a component.
 *   Example: "build me a pomodoro timer", "make a dashboard for my expenses".
 * - chat: Pure conversation — questions, opinions, advice, code snippets,
 *   settings help. No visualization needed.
 * - skill: Targeted operations on a card already rendered in the conversation:
 *     - component-fix: "make that chart blue", "add a tooltip", "it crashed"
 *     - component-search: "find a timer component", "what components exist"
 */
const RouteSchema = z.object({
  route: z.enum(['render', 'build', 'chat', 'skill']),
  skill: z.enum(['component-search', 'component-fix']).nullable(),
  summary: z.string(),
  targetComponentId: z.string().nullable(),
})

export type RouteResult = z.infer<typeof RouteSchema>

const ROUTER_SYSTEM = `You are the CSlate router. CSlate is a chat portal where assistant responses can include live React components rendered inline in the conversation. Classify the user's message into exactly one route:

- render: The user is seeking information that would be clearer as a visual — a chart, table, timeline, comparison, map, dashboard, or stats card. Default for "show me", "how's", "track", "compare", "what's happening with", and any question where a picture beats paragraphs. DO NOT use for pure conversation or settings.

- build: The user explicitly wants a new component built. Keywords: "build", "create", "make me", "I need a component that", "design a".

- chat: Plain conversation. Questions with text answers, opinions, explanations, code snippets, help with settings, small talk. No component involved.

- skill: Operations on a previously rendered card:
  - component-fix: modifying, restyling, or fixing a card. "make it blue", "bigger font", "it crashed", "add a legend". ALWAYS set targetComponentId if a specific card is referenced.
  - component-search: browsing the library. "what timer components exist", "find me a kanban".

targetComponentId: the snake_case ID of a card being referenced. Null otherwise.
summary: one short sentence describing the intent.`

interface CardInfo {
  componentId: string
  name?: string
  description?: string
}

function buildContextualPrompt(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  recentCards: CardInfo[],
): string {
  const parts: string[] = []

  if (recentCards.length > 0) {
    const lines = recentCards.map((c) => {
      const label = c.name || c.componentId.replace(/_/g, ' ')
      return c.description
        ? `- ${c.componentId} ("${label}"): ${c.description}`
        : `- ${c.componentId} ("${label}")`
    })
    parts.push(`Cards rendered earlier in this conversation:\n${lines.join('\n')}`)
  }

  if (history.length > 0) {
    const recent = history.slice(-2)
    const historyLines = recent.map((m) => `${m.role}: ${m.content}`).join('\n')
    parts.push(`Recent messages:\n${historyLines}`)
  }

  if (parts.length === 0) return message

  return `${parts.join('\n\n')}\n\nCurrent message: ${message}`
}

export async function classifyIntent(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  recentCards: CardInfo[],
  config: LLMConfig,
  registry: { languageModel: (id: string) => any },
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
      prompt: buildContextualPrompt(message, history, recentCards),
      schema: RouteSchema,
    })
    log.debug({ modelId, durationMs: Date.now() - t0, route: object.route }, 'classifyIntent done')
    return object
  } catch (err) {
    log.warn({ modelId, err }, 'classifyIntent failed, defaulting to chat')
    return { route: 'chat', skill: null, summary: message, targetComponentId: null }
  }
}
