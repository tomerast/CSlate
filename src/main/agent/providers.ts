import { createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { createOllama } from 'ollama-ai-provider'

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'local'
  apiKey?: string
  model: string
  baseUrl?: string
  fastModel?: string
}

export function buildRegistry(config: LLMConfig) {
  return createProviderRegistry({
    anthropic: anthropic({ apiKey: config.apiKey }),
    openai: openai({ apiKey: config.apiKey }),
    google: google({ apiKey: config.apiKey }),
    local: createOllama({ baseURL: config.baseUrl ?? 'http://localhost:11434' }),
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
