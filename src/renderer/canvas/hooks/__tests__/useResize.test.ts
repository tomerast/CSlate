import { describe, it, expect } from 'vitest'
import { applyConstraints, findNearestDetent, type ResizeConstraints, type Breakpoint } from '../useResize'

describe('applyConstraints', () => {
  const base: ResizeConstraints = { minWidth: 10, minHeight: 8 }

  it('clamps below min', () => {
    const result = applyConstraints({ width: 5, height: 3 }, base)
    expect(result.width).toBe(10)
    expect(result.height).toBe(8)
  })

  it('clamps above max', () => {
    const result = applyConstraints({ width: 200, height: 150 }, { ...base, maxWidth: 100, maxHeight: 80 })
    expect(result.width).toBe(100)
    expect(result.height).toBe(80)
  })

  it('preserves aspect ratio on corner drag', () => {
    const constraints: ResizeConstraints = { minWidth: 10, minHeight: 10, preferredAspectRatio: 2 }
    const result = applyConstraints({ width: 40, height: 30 }, constraints, true)
    // aspect ratio = width/height = 2, so height should be width/2
    expect(result.width).toBe(40)
    expect(result.height).toBe(20)
  })

  it('does not enforce aspect ratio on edge drag', () => {
    const constraints: ResizeConstraints = { minWidth: 10, minHeight: 10, preferredAspectRatio: 2 }
    const result = applyConstraints({ width: 40, height: 30 }, constraints, false)
    expect(result.width).toBe(40)
    expect(result.height).toBe(30)
  })

  it('respects min after aspect ratio correction', () => {
    const constraints: ResizeConstraints = { minWidth: 10, minHeight: 10, preferredAspectRatio: 0.5 }
    // aspect = 0.5 => width/height = 0.5 => height = width / 0.5 = width * 2
    // width=10, height = 20 (satisfies min)
    const result = applyConstraints({ width: 10, height: 5 }, constraints, true)
    expect(result.width).toBe(10)
    expect(result.height).toBe(20)
  })
})

describe('findNearestDetent', () => {
  const breakpoints: Breakpoint[] = [
    { name: 'Mobile', width: 48, height: 80 },
    { name: 'Tablet', width: 96, height: 80 },
    { name: 'Desktop', width: 160, height: 100 },
  ]

  it('snaps to nearest breakpoint within threshold', () => {
    // Close to Mobile (48, 80)
    const result = findNearestDetent({ width: 49, height: 81 }, breakpoints, 3)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Mobile')
    expect(result!.width).toBe(48)
    expect(result!.height).toBe(80)
  })

  it('returns null when outside threshold', () => {
    const result = findNearestDetent({ width: 70, height: 80 }, breakpoints, 3)
    expect(result).toBeNull()
  })

  it('picks the closest when multiple are in range', () => {
    // Exactly at Tablet
    const result = findNearestDetent({ width: 96, height: 80 }, breakpoints, 5)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Tablet')
  })
})
