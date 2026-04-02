import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  tool: vi.fn((config) => config),
}))

import { buildSkillRegistry } from '../skills/index'

describe('buildSkillRegistry (reduced)', () => {
  it('contains state-wirer, component-search, and pipeline-wirer', () => {
    const registry = buildSkillRegistry({})
    const keys = Object.keys(registry)
    expect(keys).toContain('state-wirer')
    expect(keys).toContain('component-search')
    expect(keys).toContain('pipeline-wirer')
  })
})
