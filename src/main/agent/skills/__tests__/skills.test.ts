import { describe, it, expect } from 'vitest'
import { buildSkillRegistry } from '../index'

const mockTools = {}

describe('buildSkillRegistry', () => {
  it('returns the legacy skills including pipeline-wirer', () => {
    const registry = buildSkillRegistry(mockTools)
    expect(registry['state-wirer']).toBeDefined()
    expect(registry['component-search']).toBeDefined()
    expect(registry['pipeline-wirer']).toBeDefined()
  })

  it('state-wirer systemPrompt lists active components', () => {
    const registry = buildSkillRegistry(mockTools)
    const skill = registry['state-wirer']
    const prompt = skill.systemPrompt({
      projectDir: '/tmp/test',
      tabId: 'tab1',
      memory: { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' },
      activeComponents: [{ componentId: 'stock_ticker', manifest: {} }],
      conversationHistory: [],
    })
    expect(prompt).toContain('stock_ticker')
  })

})
