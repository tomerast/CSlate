import { describe, it, expect } from 'vitest'
import { buildSkillRegistry } from '../index'

const mockTools = {}

describe('buildSkillRegistry', () => {
  it('returns all 7 skills', () => {
    const registry = buildSkillRegistry(mockTools)
    expect(Object.keys(registry)).toHaveLength(7)
    expect(registry['component-builder']).toBeDefined()
    expect(registry['component-modifier']).toBeDefined()
    expect(registry['state-wirer']).toBeDefined()
  })

  it('component-builder systemPrompt includes platform knowledge', () => {
    const registry = buildSkillRegistry(mockTools)
    const skill = registry['component-builder']
    const prompt = skill.systemPrompt({
      projectDir: '/tmp/test',
      tabId: 'tab1',
      memory: { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' },
      activeComponents: [],
      conversationHistory: [],
    })
    expect(prompt).toContain('bridge.fetch')
    expect(prompt).toContain('bg-primary')
    expect(prompt).toContain('manifest.json')
    expect(prompt).toContain('sandbox')
  })

  it('component-builder systemPrompt includes memory context when present', () => {
    const registry = buildSkillRegistry(mockTools)
    const skill = registry['component-builder']
    const prompt = skill.systemPrompt({
      projectDir: '/tmp/test',
      tabId: 'tab1',
      memory: { userPreferences: 'Prefers dark themes.', projectContext: '', componentHistory: '', feedbackPatterns: '' },
      activeComponents: [],
      conversationHistory: [],
    })
    expect(prompt).toContain('Prefers dark themes.')
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
