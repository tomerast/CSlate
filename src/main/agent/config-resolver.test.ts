import { beforeEach, describe, expect, it, vi } from 'vitest'

const config = new Map<string, unknown>()

vi.mock('../ipc/config', () => ({
  getConfigValue: (key: string) => config.get(key) ?? null,
}))

const { resolveLLMConfig } = await import('./config-resolver')

describe('resolveLLMConfig', () => {
  beforeEach(() => {
    config.clear()
    config.set('llmApiKey', 'test-key')
  })

  it('uses the explicit direct provider even when a gateway URL exists', () => {
    config.set('llmProvider', 'anthropic')
    config.set('llmModel', 'anthropic/claude-sonnet-4-6')
    config.set('llmFastModel', 'anthropic/claude-haiku-4-5')
    config.set('gatewayUrl', 'https://openrouter.ai/api/v1')

    expect(resolveLLMConfig()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'test-key',
      baseUrl: undefined,
      fastModel: 'claude-haiku-4-5',
    })
  })

  it('uses OpenAI-compatible config for gateway mode', () => {
    config.set('llmProvider', 'gateway')
    config.set('llmModel', 'anthropic/claude-sonnet-4-6')
    config.set('gatewayUrl', 'https://ai-gateway.vercel.sh/v1')

    expect(resolveLLMConfig()).toEqual({
      provider: 'openai',
      model: 'anthropic/claude-sonnet-4-6',
      apiKey: 'test-key',
      baseUrl: 'https://ai-gateway.vercel.sh/v1',
      fastModel: undefined,
    })
  })

  it('does not require an API key for local Ollama', () => {
    config.delete('llmApiKey')
    config.set('llmProvider', 'local')
    config.set('llmModel', 'llama3.2')

    expect(resolveLLMConfig()).toEqual({
      provider: 'local',
      model: 'llama3.2',
      apiKey: undefined,
      baseUrl: 'http://localhost:11434',
      fastModel: undefined,
    })
  })

  it('preserves gateway fast model IDs for OpenAI-compatible routing', () => {
    config.set('llmProvider', 'gateway')
    config.set('llmModel', 'anthropic/claude-sonnet-4-6')
    config.set('llmFastModel', 'openai/gpt-4o-mini')
    config.set('gatewayUrl', 'https://ai-gateway.vercel.sh/v1')

    expect(resolveLLMConfig()).toEqual({
      provider: 'openai',
      model: 'anthropic/claude-sonnet-4-6',
      apiKey: 'test-key',
      baseUrl: 'https://ai-gateway.vercel.sh/v1',
      fastModel: 'openai/gpt-4o-mini',
    })
  })

  it('returns null when a cloud provider has no API key', () => {
    config.delete('llmApiKey')
    config.set('llmProvider', 'openai')
    config.set('llmModel', 'openai/gpt-4o-mini')

    expect(resolveLLMConfig()).toBeNull()
  })
})
