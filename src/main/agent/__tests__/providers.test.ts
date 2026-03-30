import { describe, it, expect, vi } from 'vitest'

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => ({ type: 'provider', name: 'anthropic', languageModel: vi.fn() }))
}))
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({ type: 'provider', name: 'openai', languageModel: vi.fn() }))
}))
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({ type: 'provider', name: 'google', languageModel: vi.fn() }))
}))
vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => ({ type: 'provider', name: 'local' }))
}))
vi.mock('ai', () => ({
  createProviderRegistry: vi.fn((providers) => ({
    languageModel: (id: string) => {
      const [prefix] = id.split(':')
      return providers[prefix]
    }
  }))
}))

import { buildRegistry, mainModelId, fastModelId } from '../providers'

describe('buildRegistry', () => {
  it('builds registry for anthropic provider', () => {
    const registry = buildRegistry({ provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6' })
    const model = registry.languageModel('anthropic:claude-sonnet-4-6')
    expect(model).toBeDefined()
  })

  it('builds registry for openai provider', () => {
    const registry = buildRegistry({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' })
    const model = registry.languageModel('openai:gpt-4o')
    expect(model).toBeDefined()
  })

  it('builds registry for local ollama provider', () => {
    const registry = buildRegistry({ provider: 'local', baseUrl: 'http://localhost:11434', model: 'llama3' })
    const model = registry.languageModel('local:llama3')
    expect(model).toBeDefined()
  })
})

describe('mainModelId', () => {
  it('returns provider:model string', () => {
    expect(mainModelId({ provider: 'anthropic', model: 'claude-sonnet-4-6' })).toBe('anthropic:claude-sonnet-4-6')
  })
})

describe('fastModelId', () => {
  it('uses fastModel override when provided', () => {
    expect(fastModelId({ provider: 'anthropic', model: 'claude-sonnet-4-6', fastModel: 'claude-haiku-4-5-20251001' })).toBe('anthropic:claude-haiku-4-5-20251001')
  })
  it('falls back to default fast model for anthropic', () => {
    expect(fastModelId({ provider: 'anthropic', model: 'claude-sonnet-4-6' })).toBe('anthropic:claude-haiku-4-5-20251001')
  })
})
