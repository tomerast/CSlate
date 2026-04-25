import type { LLMConfig } from '@cslate/shared/agent'
import { getConfigValue } from '../ipc/config'

const DIRECT_MODEL_IDS: Record<string, string> = {
  'anthropic/claude-sonnet-4-6': 'claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5': 'claude-haiku-4-5',
  'anthropic/claude-opus-4-6': 'claude-opus-4-6',
  'openai/gpt-4o': 'gpt-4o',
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'google/gemini-2.5-pro': 'gemini-2.5-pro-preview',
  'google/gemini-2.5-flash': 'gemini-2.5-flash-preview',
  'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'google/gemini-3-flash': 'gemini-3-flash',
}

type StoredProvider = LLMConfig['provider'] | 'gateway'

function parseModelId(llmModel: string): {
  provider: LLMConfig['provider']
  model: string
} {
  if (llmModel.startsWith('anthropic/')) {
    return {
      provider: 'anthropic',
      model: DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('anthropic/'.length),
    }
  }
  if (llmModel.startsWith('openai/')) {
    return {
      provider: 'openai',
      model: DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('openai/'.length),
    }
  }
  if (llmModel.startsWith('google/')) {
    return {
      provider: 'google',
      model: DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('google/'.length),
    }
  }
  return { provider: 'local', model: llmModel }
}

function modelForProvider(modelId: string, provider: StoredProvider): string {
  if (provider === 'gateway') return modelId
  if (provider === 'local') {
    return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId
  }
  const parsed = parseModelId(modelId)
  return parsed.provider === provider
    ? parsed.model
    : DIRECT_MODEL_IDS[modelId] ?? modelId.replace(/^(anthropic|openai|google)\//, '')
}

/**
 * Load the LLM configuration the same way agent:run does — gateway URL wins
 * if configured, otherwise fall back to direct provider.
 *
 * Returns null when no API key is configured and the provider is not local.
 */
export function resolveLLMConfig(): LLMConfig | null {
  const llmProvider =
    ((getConfigValue('llmProvider') as StoredProvider | null) ?? 'anthropic')
  const gatewayUrl = (getConfigValue('gatewayUrl') as string) ?? ''
  const llmModel =
    (getConfigValue('llmModel') as string) ?? 'anthropic/claude-sonnet-4-6'
  const llmFastModel = (getConfigValue('llmFastModel') as string | null) ?? ''
  const apiKey = (getConfigValue('llmApiKey') as string | null) ?? undefined

  let provider: LLMConfig['provider'] = 'anthropic'
  let model = llmModel
  let baseUrl: string | undefined

  if (llmProvider === 'gateway') {
    provider = 'openai'
    model = llmModel
    baseUrl = gatewayUrl || undefined
  } else if (llmProvider === 'local') {
    provider = 'local'
    model = modelForProvider(llmModel, llmProvider)
    baseUrl = gatewayUrl || 'http://localhost:11434'
  } else if (llmProvider === 'anthropic' || llmProvider === 'openai' || llmProvider === 'google') {
    provider = llmProvider
    model = modelForProvider(llmModel, llmProvider)
  } else {
    ;({ provider, model } = parseModelId(llmModel))
  }

  if (!apiKey && provider !== 'local') return null

  const fastModel = llmFastModel ? modelForProvider(llmFastModel, llmProvider) : undefined

  return { provider, model, apiKey, baseUrl, fastModel }
}
