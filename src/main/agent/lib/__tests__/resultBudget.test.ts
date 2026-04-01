import { describe, it, expect, vi, afterEach } from 'vitest'
import { budgetToolResult } from '../resultBudget'

describe('budgetToolResult', () => {
  it('returns small strings unchanged', () => {
    expect(budgetToolResult('hello', 'test')).toBe('hello')
  })

  it('returns small objects unchanged', () => {
    const obj = { key: 'value' }
    expect(budgetToolResult(obj, 'test')).toEqual(obj)
  })

  it('truncates large strings', () => {
    const large = 'x'.repeat(60_000)
    const result = budgetToolResult(large, 'big', 50_000) as string
    expect(result.length).toBeLessThan(large.length)
    expect(result).toContain('[Truncated')
    expect(result).toContain('60000 chars')
  })

  it('marks large objects as truncated', () => {
    const largeObj = { data: 'x'.repeat(60_000) }
    const result = budgetToolResult(largeObj, 'big', 50_000) as any
    expect(result.__truncated).toBe(true)
    expect(result.__originalSize).toBeGreaterThan(50_000)
  })

  it('returns null/undefined unchanged', () => {
    expect(budgetToolResult(null, 'test')).toBeNull()
    expect(budgetToolResult(undefined, 'test')).toBeUndefined()
  })

  it('uses default 50_000 maxChars', () => {
    const justUnder = 'x'.repeat(49_999)
    expect(budgetToolResult(justUnder, 'test')).toBe(justUnder)
  })
})
