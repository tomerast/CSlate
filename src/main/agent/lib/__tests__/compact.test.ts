import { describe, it, expect } from 'vitest'
import { estimateTokens, shouldCompact, buildCompactSummary, autoCompactIfNeeded } from '../compact'

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('Hello world, this is a test.')).toBeGreaterThan(5)
    expect(estimateTokens('Hello world, this is a test.')).toBeLessThan(15)
  })
  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('shouldCompact', () => {
  it('returns false under threshold', () => {
    const msgs = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi!' },
      { role: 'user' as const, content: 'How?' },
      { role: 'assistant' as const, content: 'Good' },
    ]
    expect(shouldCompact(msgs, 200_000)).toBe(false)
  })

  it('returns true over 80% of context window', () => {
    const long = 'x'.repeat(100_000)
    const msgs = [
      { role: 'user' as const, content: long },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: long },
      { role: 'assistant' as const, content: long },
    ]
    expect(shouldCompact(msgs, 100_000)).toBe(true)
  })

  it('never compacts fewer than 4 messages', () => {
    const long = 'x'.repeat(200_000)
    const msgs = [
      { role: 'user' as const, content: long },
      { role: 'assistant' as const, content: long },
    ]
    expect(shouldCompact(msgs, 10_000)).toBe(false)
  })
})

describe('buildCompactSummary', () => {
  it('preserves last N messages', () => {
    const msgs = [
      { role: 'user' as const, content: 'Build a stock ticker' },
      { role: 'assistant' as const, content: 'Searching blueprints...' },
      { role: 'user' as const, content: 'Make it red' },
      { role: 'assistant' as const, content: 'Updated color to red.' },
    ]
    const result = buildCompactSummary(msgs, 2)
    expect(result.preserved).toHaveLength(2)
    expect(result.preserved[0].content).toBe('Make it red')
    expect(result.summary).toContain('stock ticker')
  })
})

describe('autoCompactIfNeeded', () => {
  it('returns original when under threshold', () => {
    const msgs = [
      { role: 'user' as const, content: 'Hi' },
      { role: 'assistant' as const, content: 'Hello' },
    ]
    expect(autoCompactIfNeeded(msgs)).toBe(msgs)
  })

  it('returns compacted when over threshold', () => {
    const long = 'x'.repeat(100_000)
    const msgs = [
      { role: 'user' as const, content: long },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: long },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: 'recent' },
      { role: 'assistant' as const, content: 'also recent' },
    ]
    const result = autoCompactIfNeeded(msgs, 50_000)
    expect(result.length).toBeLessThan(msgs.length)
    expect(result[0].role).toBe('system') // summary
    expect(result[result.length - 1].content).toBe('also recent')
  })
})
