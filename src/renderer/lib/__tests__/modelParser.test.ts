import { describe, expect, it } from 'vitest'
import { parseModelId } from '../modelParser'

describe('parseModelId', () => {
  it('parses native provider model IDs', () => {
    expect(parseModelId('anthropic/claude-sonnet-4-6')).toMatchObject({
      fullId: 'anthropic/claude-sonnet-4-6',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      displayName: 'Claude Sonnet',
    })
  })

  it('parses gateway-prefixed model IDs', () => {
    expect(parseModelId('openai:moonshotai/kimi-k2.6')).toMatchObject({
      fullId: 'openai:moonshotai/kimi-k2.6',
      provider: 'moonshotai',
      model: 'kimi-k2.6',
      displayName: 'Kimi K2.6',
    })
  })

  it('falls back to a readable unknown model label', () => {
    expect(parseModelId('vendor/custom_model')).toMatchObject({
      provider: 'vendor',
      model: 'custom_model',
      displayName: 'Vendor Custom Model',
    })
  })
})
