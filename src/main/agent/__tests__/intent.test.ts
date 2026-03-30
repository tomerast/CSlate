import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn()
}))

import { generateObject } from 'ai'
import { parseIntent } from '../intent'

const mockConfig = { provider: 'anthropic' as const, apiKey: 'test', model: 'claude-sonnet-4-6' }
const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('parseIntent', () => {
  it('classifies new component request as component-builder', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skill: 'component-builder',
        targetComponentId: undefined,
        summary: 'stock ticker showing AAPL price',
        isMultiTurn: false,
      }
    } as any)

    const result = await parseIntent('Add a live stock ticker for AAPL', mockConfig, mockRegistry as any)
    expect(result.skill).toBe('component-builder')
    expect(result.summary).toBe('stock ticker showing AAPL price')
  })

  it('classifies modification request as component-modifier', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skill: 'component-modifier',
        targetComponentId: 'todo-list',
        summary: 'make todo items draggable',
        isMultiTurn: false,
      }
    } as any)

    const result = await parseIntent('Make the todo list items draggable', mockConfig, mockRegistry as any)
    expect(result.skill).toBe('component-modifier')
    expect(result.targetComponentId).toBe('todo-list')
  })

  it('classifies style request as style-applier', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skill: 'style-applier',
        targetComponentId: 'header',
        summary: 'apply dark theme colors',
        isMultiTurn: false,
      }
    } as any)

    const result = await parseIntent('Make the header darker', mockConfig, mockRegistry as any)
    expect(result.skill).toBe('style-applier')
  })
})
