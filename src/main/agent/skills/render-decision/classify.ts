import { z } from 'zod'
import { fastModelId, type LLMConfig } from '@cslate/shared/agent'
import { runStructuredAgentSafe } from '../../lib/structuredAgent'
import { classifySystem } from './prompts'
import { engineLog } from '../../../lib/logger'

const ClassifySchema = z.object({
  shouldRender: z.boolean(),
  renderType: z.string().nullable(),
  searchQuery: z.string().nullable(),
  reasoning: z.string(),
})

export type RenderDecision = z.infer<typeof ClassifySchema>

export async function classifyRenderType(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  config: LLMConfig,
  registry: { languageModel: (id: string) => any },
  userMemory?: string,
): Promise<RenderDecision> {
  const recent = history.slice(-3).map((m) => `${m.role}: ${m.content}`).join('\n')
  const prompt = recent
    ? `Recent conversation:\n${recent}\n\nCurrent message: ${message}`
    : message

  try {
    return await runStructuredAgentSafe({
      modelId: fastModelId(config),
      registry,
      system: classifySystem(userMemory),
      prompt,
      schema: ClassifySchema,
    })
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err)
    engineLog
      .child({ component: 'render-decision-classify' })
      .error({ modelId: fastModelId(config), err: rawMsg }, 'render classifier failed')
    return {
      shouldRender: false,
      renderType: null,
      searchQuery: null,
      reasoning: 'classifier failed',
    }
  }
}
