import { describe, it, expect } from 'vitest'
import { scoreAffinity, solvePlacement } from '../placementSolver'
import type { PlacementWithId } from '../collision'

describe('scoreAffinity', () => {
  it('returns 0 when there is no overlap', () => {
    const score = scoreAffinity(
      { tags: ['chart'], description: 'A pie chart' },
      { tags: ['form'], description: 'Login form widget' },
    )
    expect(score).toBe(0)
  })

  it('scores 2 points per matching tag (case-insensitive)', () => {
    const score = scoreAffinity(
      { tags: ['Dashboard', 'chart'], description: '' },
      { tags: ['dashboard', 'CHART'], description: '' },
    )
    expect(score).toBe(4) // 2 matching tags * 2 points
  })

  it('scores 0.5 per shared description keyword (3+ chars)', () => {
    const score = scoreAffinity(
      { tags: [], description: 'weather forecast display widget' },
      { tags: [], description: 'weather forecast panel' },
    )
    // shared words 3+ chars: "weather" (7), "forecast" (8) => 2 * 0.5 = 1.0
    expect(score).toBe(1.0)
  })

  it('combines tag and description scores', () => {
    const score = scoreAffinity(
      { tags: ['weather'], description: 'current weather display' },
      { tags: ['Weather'], description: 'weather forecast panel' },
    )
    // tag match: "weather" => 2
    // description shared words 3+ chars: "weather" => 0.5
    expect(score).toBe(2.5)
  })

  it('ignores short words under 3 chars in descriptions', () => {
    const score = scoreAffinity(
      { tags: [], description: 'a to be or' },
      { tags: [], description: 'a to be or' },
    )
    expect(score).toBe(0)
  })
})

describe('solvePlacement', () => {
  it('places first component at (2, 2)', () => {
    const pos = solvePlacement(
      { tags: [], description: '' },
      { width: 50, height: 25 },
      [],
      [],
    )
    expect(pos).toEqual({ x: 2, y: 2 })
  })

  it('places related component adjacent to its best-affinity anchor', () => {
    const existing: PlacementWithId[] = [
      { id: 'weather-card', x: 2, y: 2, width: 50, height: 25 },
    ]
    const manifests = [
      { id: 'weather-card', tags: ['weather'], description: 'current weather display' },
    ]
    const pos = solvePlacement(
      { tags: ['weather'], description: 'weather forecast panel' },
      { width: 40, height: 20 },
      existing,
      manifests,
    )
    // Should be placed to the right of weather-card: x = 2 + 50 + 2 = 54, y = 2
    expect(pos).toEqual({ x: 54, y: 2 })
  })

  it('falls back to below when right is blocked', () => {
    const existing: PlacementWithId[] = [
      { id: 'anchor', x: 2, y: 2, width: 50, height: 25 },
      // Block the right side
      { id: 'blocker', x: 54, y: 0, width: 60, height: 40 },
    ]
    const manifests = [
      { id: 'anchor', tags: ['dashboard'], description: 'main dashboard' },
      { id: 'blocker', tags: ['sidebar'], description: 'sidebar panel' },
    ]
    const pos = solvePlacement(
      { tags: ['dashboard'], description: 'dashboard widget' },
      { width: 50, height: 25 },
      existing,
      manifests,
    )
    // Right of anchor is blocked, should try below: x = 2, y = 2 + 25 + 2 = 29
    expect(pos).toEqual({ x: 2, y: 29 })
  })

  it('uses findEmptyRect when all positions around all anchors are blocked', () => {
    // Surround the anchor on all sides
    const existing: PlacementWithId[] = [
      { id: 'center', x: 100, y: 100, width: 50, height: 25 },
      { id: 'right', x: 152, y: 90, width: 200, height: 60 },
      { id: 'below', x: 90, y: 127, width: 80, height: 200 },
      { id: 'left', x: 0, y: 90, width: 98, height: 60 },
      { id: 'above', x: 90, y: 0, width: 80, height: 98 },
    ]
    const manifests = [
      { id: 'center', tags: ['target'], description: 'target component' },
      { id: 'right', tags: [], description: '' },
      { id: 'below', tags: [], description: '' },
      { id: 'left', tags: [], description: '' },
      { id: 'above', tags: [], description: '' },
    ]
    const pos = solvePlacement(
      { tags: ['target'], description: 'target component' },
      { width: 50, height: 25 },
      existing,
      manifests,
    )
    // Should still return a valid position (from findEmptyRect fallback)
    expect(pos.x).toBeGreaterThanOrEqual(0)
    expect(pos.y).toBeGreaterThanOrEqual(0)
  })
})
