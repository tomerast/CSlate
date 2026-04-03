import { useState, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

export interface PlacementWithId extends Placement {
  id: string
}

export interface SnapGuide {
  axis: 'x' | 'y'
  position: number
  type: 'left' | 'right' | 'center' | 'top' | 'bottom'
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function edges(p: Placement) {
  return {
    left: p.x,
    right: p.x + p.width,
    centerX: p.x + p.width / 2,
    top: p.y,
    bottom: p.y + p.height,
    centerY: p.y + p.height / 2,
  }
}

/**
 * Compare candidate edges/centers against all others and return alignment
 * guides where the distance is within `threshold` grid units.
 *
 * X axis checks: left-left, right-right, center-center, left-right, right-left
 * Y axis checks: top-top, bottom-bottom, center-center, top-bottom, bottom-top
 *
 * Results are deduplicated by axis + position.
 */
export function calcSnapGuides(
  candidate: Placement,
  others: PlacementWithId[],
  threshold: number,
): SnapGuide[] {
  const c = edges(candidate)
  const seen = new Set<string>()
  const guides: SnapGuide[] = []

  function add(axis: 'x' | 'y', position: number, type: SnapGuide['type']) {
    const key = `${axis}:${position}`
    if (seen.has(key)) return
    seen.add(key)
    guides.push({ axis, position, type })
  }

  for (const other of others) {
    const o = edges(other)

    // X-axis comparisons — guide position is always the *other's* edge value
    const xChecks: Array<[number, number, SnapGuide['type']]> = [
      [c.left, o.left, 'left'],
      [c.right, o.right, 'right'],
      [c.centerX, o.centerX, 'center'],
      [c.left, o.right, 'left'],
      [c.right, o.left, 'right'],
    ]

    for (const [cVal, oVal, type] of xChecks) {
      if (Math.abs(cVal - oVal) <= threshold) {
        add('x', oVal, type)
      }
    }

    // Y-axis comparisons
    const yChecks: Array<[number, number, SnapGuide['type']]> = [
      [c.top, o.top, 'top'],
      [c.bottom, o.bottom, 'bottom'],
      [c.centerY, o.centerY, 'center'],
      [c.top, o.bottom, 'top'],
      [c.bottom, o.top, 'bottom'],
    ]

    for (const [cVal, oVal, type] of yChecks) {
      if (Math.abs(cVal - oVal) <= threshold) {
        add('y', oVal, type)
      }
    }
  }

  return guides
}

/**
 * Adjust `pos` so the nearest matching edge/center snaps to a guide line.
 * For each axis, picks the guide whose corresponding edge is closest
 * (within threshold) and shifts the position accordingly.
 */
export function applySnap(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  guides: SnapGuide[],
  threshold: number,
): { x: number; y: number } {
  let { x, y } = pos

  // --- X axis ---
  const xGuides = guides.filter((g) => g.axis === 'x')
  let bestXDist = Infinity
  let bestX = x

  for (const g of xGuides) {
    let candidateEdge: number
    switch (g.type) {
      case 'left':
        candidateEdge = x
        break
      case 'right':
        candidateEdge = x + size.width
        break
      case 'center':
        candidateEdge = x + size.width / 2
        break
      default:
        continue
    }

    const dist = Math.abs(candidateEdge - g.position)
    if (dist <= threshold && dist < bestXDist) {
      bestXDist = dist
      switch (g.type) {
        case 'left':
          bestX = g.position
          break
        case 'right':
          bestX = g.position - size.width
          break
        case 'center':
          bestX = g.position - size.width / 2
          break
      }
    }
  }
  x = bestX

  // --- Y axis ---
  const yGuides = guides.filter((g) => g.axis === 'y')
  let bestYDist = Infinity
  let bestY = y

  for (const g of yGuides) {
    let candidateEdge: number
    switch (g.type) {
      case 'top':
        candidateEdge = y
        break
      case 'bottom':
        candidateEdge = y + size.height
        break
      case 'center':
        candidateEdge = y + size.height / 2
        break
      default:
        continue
    }

    const dist = Math.abs(candidateEdge - g.position)
    if (dist <= threshold && dist < bestYDist) {
      bestYDist = dist
      switch (g.type) {
        case 'top':
          bestY = g.position
          break
        case 'bottom':
          bestY = g.position - size.height
          break
        case 'center':
          bestY = g.position - size.height / 2
          break
      }
    }
  }
  y = bestY

  return { x, y }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useSnapGuides() {
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([])

  const updateGuides = useCallback(
    (candidate: Placement, others: PlacementWithId[], threshold: number) => {
      const guides = calcSnapGuides(candidate, others, threshold)
      setActiveGuides(guides)
      return guides
    },
    [],
  )

  const clearGuides = useCallback(() => {
    setActiveGuides([])
  }, [])

  return { activeGuides, updateGuides, clearGuides }
}
