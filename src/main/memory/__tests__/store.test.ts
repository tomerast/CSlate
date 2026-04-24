import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/cslate-memory-test') },
}))

import { mergeAutoUiPreferences } from '../store'

describe('mergeAutoUiPreferences', () => {
  it('adds the auto-learned UI section without replacing authored preferences', () => {
    const content = '# User Preferences\n\n- Tone: concise\n'

    const result = mergeAutoUiPreferences(content, [
      'Prefer compact dashboard cards',
      'Use high-contrast chart palettes',
    ])

    expect(result).toContain('- Tone: concise')
    expect(result).toContain('## Auto-Learned UI Preferences')
    expect(result).toContain('- Prefer compact dashboard cards')
    expect(result).toContain('- Use high-contrast chart palettes')
  })

  it('deduplicates existing learned preferences', () => {
    const content = [
      '# User Preferences',
      '',
      '## Auto-Learned UI Preferences',
      '',
      '- Prefer compact dashboard cards',
      '',
    ].join('\n')

    const result = mergeAutoUiPreferences(content, [
      'Prefer compact dashboard cards.',
      'Prefer compact dashboard cards',
    ])

    expect(result.match(/Prefer compact dashboard cards/g)).toHaveLength(1)
  })
})
