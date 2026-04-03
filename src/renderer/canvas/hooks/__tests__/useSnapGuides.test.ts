import { describe, it, expect } from 'vitest'
import { calcSnapGuides, applySnap } from '../useSnapGuides'
import type { PlacementWithId, SnapGuide } from '../useSnapGuides'

describe('calcSnapGuides', () => {
  const threshold = 5

  it('detects left-edge alignment', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    const others: PlacementWithId[] = [
      { id: 'a', x: 100, y: 200, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toContainEqual(
      expect.objectContaining({ axis: 'x', position: 100, type: 'left' }),
    )
  })

  it('detects right-edge alignment', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    // candidate right = 180; other right = 180
    const others: PlacementWithId[] = [
      { id: 'b', x: 120, y: 200, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toContainEqual(
      expect.objectContaining({ axis: 'x', position: 180, type: 'right' }),
    )
  })

  it('detects center-center alignment (x axis)', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    // candidate center x = 140; other center x = 140
    const others: PlacementWithId[] = [
      { id: 'c', x: 110, y: 200, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toContainEqual(
      expect.objectContaining({ axis: 'x', position: 140, type: 'center' }),
    )
  })

  it('detects top-edge alignment', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    const others: PlacementWithId[] = [
      { id: 'd', x: 300, y: 50, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toContainEqual(
      expect.objectContaining({ axis: 'y', position: 50, type: 'top' }),
    )
  })

  it('detects bottom-edge alignment', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    // candidate bottom = 90; other bottom = 90
    const others: PlacementWithId[] = [
      { id: 'e', x: 300, y: 30, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toContainEqual(
      expect.objectContaining({ axis: 'y', position: 90, type: 'bottom' }),
    )
  })

  it('detects alignment within threshold (not exact)', () => {
    const candidate = { x: 102, y: 50, width: 80, height: 40 }
    const others: PlacementWithId[] = [
      { id: 'f', x: 100, y: 200, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toContainEqual(
      expect.objectContaining({ axis: 'x', position: 100, type: 'left' }),
    )
  })

  it('returns empty when nothing aligns', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    const others: PlacementWithId[] = [
      { id: 'g', x: 500, y: 500, width: 60, height: 60 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    expect(guides).toEqual([])
  })

  it('deduplicates guides by axis+position', () => {
    const candidate = { x: 100, y: 50, width: 80, height: 40 }
    // Two others with same left edge
    const others: PlacementWithId[] = [
      { id: 'h', x: 100, y: 200, width: 60, height: 60 },
      { id: 'i', x: 100, y: 300, width: 70, height: 70 },
    ]
    const guides = calcSnapGuides(candidate, others, threshold)
    const leftGuides = guides.filter(
      (g) => g.axis === 'x' && g.position === 100 && g.type === 'left',
    )
    expect(leftGuides).toHaveLength(1)
  })
})

describe('applySnap', () => {
  const threshold = 5

  it('snaps x within threshold to left guide', () => {
    const guides: SnapGuide[] = [{ axis: 'x', position: 100, type: 'left' }]
    const result = applySnap({ x: 103, y: 50 }, { width: 80, height: 40 }, guides, threshold)
    expect(result.x).toBe(100)
    expect(result.y).toBe(50)
  })

  it('snaps y within threshold to top guide', () => {
    const guides: SnapGuide[] = [{ axis: 'y', position: 200, type: 'top' }]
    const result = applySnap({ x: 50, y: 198 }, { width: 80, height: 40 }, guides, threshold)
    expect(result.x).toBe(50)
    expect(result.y).toBe(200)
  })

  it('snaps to right guide (adjusts x by width)', () => {
    const guides: SnapGuide[] = [{ axis: 'x', position: 180, type: 'right' }]
    // candidate right edge = x + width = 102 + 80 = 182, should snap so right = 180 → x = 100
    const result = applySnap({ x: 102, y: 50 }, { width: 80, height: 40 }, guides, threshold)
    expect(result.x).toBe(100)
  })

  it('snaps to center guide (adjusts x by half width)', () => {
    const guides: SnapGuide[] = [{ axis: 'x', position: 140, type: 'center' }]
    // candidate center = x + width/2 = 102 + 40 = 142, should snap so center = 140 → x = 100
    const result = applySnap({ x: 102, y: 50 }, { width: 80, height: 40 }, guides, threshold)
    expect(result.x).toBe(100)
  })

  it('snaps to bottom guide (adjusts y by height)', () => {
    const guides: SnapGuide[] = [{ axis: 'y', position: 90, type: 'bottom' }]
    // candidate bottom = y + height = 52 + 40 = 92, should snap so bottom = 90 → y = 50
    const result = applySnap({ x: 100, y: 52 }, { width: 80, height: 40 }, guides, threshold)
    expect(result.y).toBe(50)
  })

  it('does not snap when outside threshold', () => {
    const guides: SnapGuide[] = [{ axis: 'x', position: 100, type: 'left' }]
    const result = applySnap({ x: 110, y: 50 }, { width: 80, height: 40 }, guides, threshold)
    expect(result.x).toBe(110)
    expect(result.y).toBe(50)
  })

  it('picks closest guide when multiple match', () => {
    const guides: SnapGuide[] = [
      { axis: 'x', position: 100, type: 'left' },
      { axis: 'x', position: 105, type: 'left' },
    ]
    const result = applySnap({ x: 103, y: 50 }, { width: 80, height: 40 }, guides, threshold)
    // 103 is closer to 105 (diff=2) than 100 (diff=3)
    expect(result.x).toBe(105)
  })
})
