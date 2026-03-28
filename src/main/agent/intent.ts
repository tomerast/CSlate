import { generateObject } from 'ai'
import { z } from 'zod'
import type { LLMConfig } from './providers'
import { fastModelId } from './providers'

export const SkillNameSchema = z.enum([
  'component-builder',
  'component-modifier',
  'manifest-generator',
  'component-search',
  'state-wirer',
  'feedback-iterator',
  'style-applier',
])

export type SkillName = z.infer<typeof SkillNameSchema>

export const IntentSchema = z.object({
  skill: SkillNameSchema,
  targetComponentId: z.string().optional(),
  summary: z.string(),
  isMultiTurn: z.boolean(),
})

export type Intent = z.infer<typeof IntentSchema>

const INTENT_SYSTEM = `You are the CSlate intent classifier. Given a user message, classify it into the most appropriate skill and extract key information.

Skills:
- component-builder: User wants to create a brand new component ("add", "create", "build", "make a new")
- component-modifier: User wants to change an existing component ("update", "modify", "change", "add X to the Y component")
- manifest-generator: User wants to fix or create a component manifest ("manifest", "inputs", "outputs", "contract")
- component-search: User wants to find or browse existing components ("find", "search", "show me components", "do you have")
- state-wirer: User wants to connect components together ("connect", "wire", "link", "when X updates Y", "share data between")
- feedback-iterator: User is giving feedback on the current result ("I don't like", "make it", "change the", "too big", "wrong color", "looks bad")
- style-applier: User wants visual/style changes ("restyle", "dark mode", "colors", "font", "theme", "make it prettier")

targetComponentId: the componentId of an existing component being referenced (snake_case). Omit if creating new.
summary: one sentence describing what to do.
isMultiTurn: true if this will need back-and-forth conversation.`

export async function parseIntent(
  message: string,
  config: LLMConfig,
  registry: ReturnType<typeof import('./providers').buildRegistry>
): Promise<Intent> {
  const { object } = await generateObject({
    model: registry.languageModel(fastModelId(config) as `anthropic:${string}`),
    system: INTENT_SYSTEM,
    prompt: message,
    schema: IntentSchema,
  })
  return object
}
