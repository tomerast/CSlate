import { AnthropicClient } from './AnthropicClient'
import type { LLMClient } from './types'

export type LLMProvider = 'anthropic'

export function createLLMClient(provider: LLMProvider, apiKey: string): LLMClient {
  if (provider === 'anthropic') return new AnthropicClient(apiKey)
  throw new Error(`Unsupported LLM provider: ${provider}`)
}
