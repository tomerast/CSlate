import { useCallback, useRef, useState } from 'react'
import { checkCollision, clampResize, clampToBounds, type Placement, type PlacementWithId } from '../lib/collision'

// ── Types ──────────────────────────────────────────────────────────────

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface ResizeConstraints {
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
  preferredAspectRatio?: number // width / height
}

export interface Breakpoint {
  name: string
  width: number
  height: number
}

export interface DetentInfo {
  name: string
  width: number
  height: number
}

// ── Pure helpers (exported for testing) ────────────────────────────────

export function applyConstraints(
  size: { width: number; height: number },
  constraints: ResizeConstraints,
  isCorner = false,
): { width: number; height: number } {
  let { width, height } = size

  // Clamp to min/max first
  width = Math.max(constraints.minWidth, width)
  height = Math.max(constraints.minHeight, height)
  if (constraints.maxWidth != null) width = Math.min(constraints.maxWidth, width)
  if (constraints.maxHeight != null) height = Math.min(constraints.maxHeight, height)

  // Enforce aspect ratio on corner drags only
  if (isCorner && constraints.preferredAspectRatio != null) {
    const ar = constraints.preferredAspectRatio
    // Derive height from width
    const derivedHeight = Math.round(width / ar)
    height = Math.max(constraints.minHeight, derivedHeight)
    if (constraints.maxHeight != null) height = Math.min(constraints.maxHeight, height)
    // Re-derive width to stay consistent after height clamping
    width = Math.round(height * ar)
    width = Math.max(constraints.minWidth, width)
    if (constraints.maxWidth != null) width = Math.min(constraints.maxWidth, width)
  }

  return { width, height }
}

export function findNearestDetent(
  size: { width: number; height: number },
  breakpoints: Breakpoint[],
  threshold: number,
): DetentInfo | null {
  let best: DetentInfo | null = null
  let bestDist = Infinity

  for (const bp of breakpoints) {
    const dist = Math.sqrt((size.width - bp.width) ** 2 + (size.height - bp.height) ** 2)
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist
      best = { name: bp.name, width: bp.width, height: bp.height }
    }
  }

  return best
}

// ── Direction helpers ──────────────────────────────────────────────────

const GRID_PX = 8
const COLLISION_GUTTER = 1
const DETENT_THRESHOLD = 4 // grid units

function isCornerDirection(dir: ResizeDirection): boolean {
  return dir === 'ne' || dir === 'nw' || dir === 'se' || dir === 'sw'
}

/**
 * Given a direction and pixel deltas, compute the new placement.
 * "Anchor" logic: dragging 'se' keeps x,y; dragging 'nw' keeps bottom-right.
 */
function computeResizedPlacement(
  dir: ResizeDirection,
  original: Placement,
  dxGrid: number,
  dyGrid: number,
): Placement {
  let { x, y, width, height } = original

  // Horizontal
  if (dir === 'e' || dir === 'se' || dir === 'ne') {
    width = original.width + dxGrid
  } else if (dir === 'w' || dir === 'sw' || dir === 'nw') {
    width = original.width - dxGrid
    x = original.x + dxGrid
  }

  // Vertical
  if (dir === 's' || dir === 'se' || dir === 'sw') {
    height = original.height + dyGrid
  } else if (dir === 'n' || dir === 'ne' || dir === 'nw') {
    height = original.height - dyGrid
    y = original.y + dyGrid
  }

  return { x, y, width, height }
}

// ── Hook ───────────────────────────────────────────────────────────────

interface ResizeState {
  isResizing: boolean
  direction: ResizeDirection | null
  tentativePlacement: Placement | null
  detent: DetentInfo | null
}

export function useResize(
  componentId: string,
  placement: Placement,
  constraints: ResizeConstraints,
  breakpoints: Breakpoint[],
  allPlacements: PlacementWithId[],
  onUpdate: (id: string, placement: Placement) => void,
) {
  const [state, setState] = useState<ResizeState>({
    isResizing: false,
    direction: null,
    tentativePlacement: null,
    detent: null,
  })

  const initialRef = useRef<{ placement: Placement; pointerX: number; pointerY: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent, direction: ResizeDirection) => {
      e.stopPropagation()
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      initialRef.current = {
        placement: { ...placement },
        pointerX: e.clientX,
        pointerY: e.clientY,
      }
      setState({
        isResizing: true,
        direction,
        tentativePlacement: placement,
        detent: null,
      })
    },
    [placement],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!initialRef.current || !state.isResizing || !state.direction) return

      const { placement: orig, pointerX, pointerY } = initialRef.current
      const dxPx = e.clientX - pointerX
      const dyPx = e.clientY - pointerY
      const dxGrid = Math.round(dxPx / GRID_PX)
      const dyGrid = Math.round(dyPx / GRID_PX)

      // 1. Raw resize from direction
      const raw = computeResizedPlacement(state.direction, orig, dxGrid, dyGrid)

      // 2. Apply constraints
      const isCorner = isCornerDirection(state.direction)
      const constrained = applyConstraints({ width: raw.width, height: raw.height }, constraints, isCorner)

      // Adjust position if top/left handles moved but constraints changed the size
      let adjustedX = raw.x
      let adjustedY = raw.y
      if (state.direction.includes('w')) {
        adjustedX = orig.x + orig.width - constrained.width
      }
      if (state.direction.includes('n')) {
        adjustedY = orig.y + orig.height - constrained.height
      }

      // Clamp position to canvas bounds
      const bounded = clampToBounds({
        x: adjustedX,
        y: adjustedY,
        width: constrained.width,
        height: constrained.height,
      })

      // 3. Check detents
      const detent = findNearestDetent(
        { width: bounded.width, height: bounded.height },
        breakpoints,
        DETENT_THRESHOLD,
      )

      // If snapping to detent, adjust size (and position for n/w handles)
      let finalPlacement: Placement
      if (detent) {
        let fx = bounded.x
        let fy = bounded.y
        if (state.direction.includes('w')) {
          fx = orig.x + orig.width - detent.width
        }
        if (state.direction.includes('n')) {
          fy = orig.y + orig.height - detent.height
        }
        finalPlacement = clampToBounds({
          x: fx,
          y: fy,
          width: detent.width,
          height: detent.height,
        })
      } else {
        finalPlacement = bounded
      }

      // 4. Collision blocking via binary-search clamp
      const others = allPlacements.filter((p) => p.id !== componentId)
      const clamped = clampResize(finalPlacement, others, COLLISION_GUTTER, componentId, orig)

      setState((prev) => ({
        ...prev,
        tentativePlacement: clamped,
        detent,
      }))
    },
    [state.isResizing, state.direction, constraints, breakpoints, allPlacements, componentId],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!state.isResizing) return
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

      if (state.tentativePlacement) {
        onUpdate(componentId, state.tentativePlacement)
      }

      initialRef.current = null
      setState({
        isResizing: false,
        direction: null,
        tentativePlacement: null,
        detent: null,
      })
    },
    [state.isResizing, state.tentativePlacement, componentId, onUpdate],
  )

  return {
    isResizing: state.isResizing,
    direction: state.direction,
    tentativePlacement: state.tentativePlacement,
    detent: state.detent,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
