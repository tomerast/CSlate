import { createProviderRegistry } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOllama } from 'ollama-ai-provider'
import type { ProviderV3 } from '@ai-sdk/provider'

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'local'
  apiKey?: string
  model: string
  baseUrl?: string
  fastModel?: string
}

export function buildRegistry(config: LLMConfig) {
  return createProviderRegistry({
    anthropic: createAnthropic({ apiKey: config.apiKey }),
    openai: createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl }),
    google: createGoogleGenerativeAI({ apiKey: config.apiKey }),
    // ollama-ai-provider uses ProviderV1; cast to ProviderV3 for registry compatibility
    local: createOllama({ baseURL: config.baseUrl ?? 'http://localhost:11434' }) as unknown as ProviderV3,
  })
}

export function mainModelId(config: LLMConfig): string {
  return `${config.provider}:${config.model}`
}

export function fastModelId(config: LLMConfig): string {
  if (config.fastModel) return `${config.provider}:${config.fastModel}`
  const defaults: Record<LLMConfig['provider'], string> = {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    google: 'gemini-1.5-flash',
    local: config.model,
  }
  return `${config.provider}:${defaults[config.provider]}`
}
