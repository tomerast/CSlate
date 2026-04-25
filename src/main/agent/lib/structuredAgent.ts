import { generateObject } from 'ai'
import type { z } from 'zod'

interface RunStructuredAgentSafeParams<T> {
  modelId: string
  registry: { languageModel: (id: string) => unknown }
  system: string
  prompt: string
  // Use ZodType with explicit Output/Input generics so zod schemas with
  // `.default(...)` resolve to the output (post-default) type.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
  maxOutputTokens?: number
  abortSignal?: AbortSignal
}

const FENCE_RE = /^```(?:json|jsx|tsx|typescript|javascript|ts|js)?\s*\n?([\s\S]*?)\n?```\s*$/

function stripJsonFences(text: string): string | null {
  const trimmed = text.trim()
  const match = trimmed.match(FENCE_RE)
  if (!match) return null
  const stripped = match[1].trim()
  return stripped === trimmed ? null : stripped
}

/**
 * `generateObject` wrapper that auto-recovers from markdown-fenced JSON output
 * (e.g. ```json\n{...}\n```), which several models still emit even when asked
 * for raw JSON. Falls back through the AI SDK's `experimental_repairText` hook
 * so the underlying schema validation runs against the cleaned text.
 */
export async function runStructuredAgentSafe<T>(
  params: RunStructuredAgentSafeParams<T>,
): Promise<T> {
  const { modelId, registry, system, prompt, schema, maxOutputTokens, abortSignal } = params
  const { object } = await generateObject({
    model: registry.languageModel(modelId) as Parameters<typeof generateObject>[0]['model'],
    system,
    prompt,
    schema,
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    abortSignal,
    experimental_repairText: async ({ text }) => stripJsonFences(text),
  })
  return object as T
}
