import { describe, it, expect } from 'vitest'
import { pickPhrase, type PhraseContext } from '../phrases'

describe('pickPhrase', () => {
  it('returns a non-empty string for every phase', () => {
    const phases = ['think', 'plan', 'build', 'test', 'done'] as const
    for (const phase of phases) {
      const result = pickPhrase(phase, {})
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('fills {componentName} template', () => {
    // Run many times to hit a template string
    let filled = false
    for (let i = 0; i < 100; i++) {
      const result = pickPhrase('plan', { componentName: 'WeatherWidget' })
      if (result.includes('WeatherWidget')) { filled = true; break }
    }
    expect(filled).toBe(true)
  })

  it('fills {file} template', () => {
    let filled = false
    for (let i = 0; i < 100; i++) {
      const result = pickPhrase('build', { file: 'ui.tsx' })
      if (result.includes('ui.tsx')) { filled = true; break }
    }
    expect(filled).toBe(true)
  })

  it('does not leave unfilled template tokens when context is missing', () => {
    for (let i = 0; i < 30; i++) {
      const result = pickPhrase('build', {})
      expect(result).not.toContain('{')
      expect(result).not.toContain('}')
    }
  })
})
