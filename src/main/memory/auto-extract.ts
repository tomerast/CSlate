import { z } from 'zod'
import { fastModelId, runStructuredAgent, type AgentRegistry, type LLMConfig } from '@cslate/shared/agent'
import { memoryStore } from './store'
import { engineLog } from '../lib/logger'

const ExtractedPreferenceSchema = z.object({
  text: z.string(),
  category: z.enum(['theme', 'density', 'layout', 'charts', 'tables', 'typography', 'color', 'motion', 'accessibility', 'data-display', 'interaction', 'other']),
  confidence: z.number().min(0).max(1),
})

const UiMemoryExtractionSchema = z.object({
  shouldWrite: z.boolean(),
  preferences: z.array(ExtractedPreferenceSchema),
  reasoning: z.string(),
})

export type ExtractedUiPreference = z.infer<typeof ExtractedPreferenceSchema>

const UI_MEMORY_SYSTEM = `You extract durable UI and visualization preferences for CSlate.

Only capture preferences about how the user wants interfaces, inline React cards, charts, tables, dashboards, typography, layout, colors, density, motion, accessibility, units, or data presentation to look or behave.

Write memory only when the user states a durable preference or corrects the assistant in a way that should affect future UI/card output. Do not store:
- facts about the user's identity, job, personal life, or domain unless it directly changes UI presentation
- one-off instructions that apply only to the current answer
- sensitive personal data
- generic requests like "show me a chart" unless they express style or presentation preference

Each preference must be short, actionable, and phrased as a stable instruction, e.g. "Prefer compact tables with sticky headers" or "Use high-contrast palettes for charts".`

function buildPrompt(params: {
  message: string
  assistantText: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  userMemory: string
}): string {
  const recent = params.history
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 1000)}`)
    .join('\n')

  return [
    params.userMemory.trim() ? `Existing memory:\n${params.userMemory.slice(0, 6000)}` : '',
    recent ? `Recent conversation:\n${recent}` : '',
    `Current user message:\n${params.message.slice(0, 3000)}`,
    params.assistantText.trim()
      ? `Assistant response:\n${params.assistantText.slice(0, 3000)}`
      : '',
  ].filter(Boolean).join('\n\n')
}

export async function extractAndStoreUiMemories(params: {
  message: string
  assistantText: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  userMemory: string
  config: LLMConfig
  registry: AgentRegistry
}): Promise<void> {
  const log = engineLog.child({ component: 'memory-extractor' })

  if (!params.message.trim()) return

  try {
    const result = await runStructuredAgent({
      modelId: fastModelId(params.config),
      registry: params.registry,
      system: UI_MEMORY_SYSTEM,
      prompt: buildPrompt(params),
      schema: UiMemoryExtractionSchema,
    })

    if (!result.shouldWrite) {
      log.debug({ reasoning: result.reasoning }, 'no UI memory extracted')
      return
    }

    const preferences = result.preferences
      .filter((pref) => pref.confidence >= 0.72)
      .map((pref) => pref.text.trim())
      .filter(Boolean)

    if (preferences.length === 0) return

    await memoryStore.addAutoUiPreferences(preferences)
    log.info({ count: preferences.length }, 'stored auto UI memories')
  } catch (err) {
    log.warn({ err }, 'UI memory extraction failed')
  }
}
