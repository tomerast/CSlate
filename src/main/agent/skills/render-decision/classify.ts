import { z } from 'zod'
import { runStructuredAgent, fastModelId, type LLMConfig } from '@cslate/shared/agent'
import { classifySystem } from './prompts'

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
    return await runStructuredAgent({
      modelId: fastModelId(config),
      registry,
      system: classifySystem(userMemory),
      prompt,
      schema: ClassifySchema,
    })
  } catch {
    return {
      shouldRender: false,
      renderType: null,
      searchQuery: null,
      reasoning: 'classifier failed',
    }
  }
}
