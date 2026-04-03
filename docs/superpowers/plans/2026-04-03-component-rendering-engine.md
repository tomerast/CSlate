# Component Rendering Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static vertical-stacking canvas with an interactive rendering engine supporting auto-sizing, semantic placement, drag with snap guides, and constraint-aware resize with breakpoint detents.

**Architecture:** Hybrid approach — `@dnd-kit/core` for drag infrastructure, custom pointer-event resize handlers, shared AABB collision system, `ResizeObserver`-based auto-sizing. All positions in grid units (1 unit = 8px).

**Tech Stack:** React 18, Zustand 4, `@dnd-kit/core`, `@dnd-kit/utilities`, TypeScript, Vitest, Tailwind CSS

---

## Task 1: Collision System (shared pure functions)

The collision module is the foundation — drag, resize, auto-size, and placement all depend on it. Pure functions, no side effects, easy to test.

**Files:**
- Create: `src/renderer/canvas/lib/collision.ts`
- Create: `src/main/agent/lib/collision.ts` (copy for main process)
- Test: `src/renderer/canvas/lib/__tests__/collision.test.ts`

- [ ] **Step 1: Write tests for `checkCollision`**

```typescript
// src/renderer/canvas/lib/__tests__/collision.test.ts
import { describe, it, expect } from 'vitest'
import { checkCollision, clampToBounds, findEmptyRect } from '../collision'
import type { PlacementWithId } from '../collision'

describe('checkCollision', () => {
  const GUTTER = 2

  it('returns no collision for non-overlapping rectangles', () => {
    const candidate = { x: 0, y: 0, width: 10, height: 10 }
    const others: PlacementWithId[] = [
      { id: 'a', x: 20, y: 0, width: 10, height: 10 },
    ]
    const result = checkCollision(candidate, others, GUTTER)
    expect(result.collides).toBe(false)
    expect(result.collidingIds).toEqual([])
  })

  it('detects direct overlap', () => {
    const candidate = { x: 5, y: 5, width: 10, height: 10 }
    const others: PlacementWithId[] = [
      { id: 'a', x: 10, y: 10, width: 10, height: 10 },
    ]
    const result = checkCollision(candidate, others, GUTTER)
    expect(result.collides).toBe(true)
    expect(result.collidingIds).toEqual(['a'])
  })

  it('detects gutter violation (boxes close but not overlapping)', () => {
    const candidate = { x: 0, y: 0, width: 10, height: 10 }
    const others: PlacementWithId[] = [
      { id: 'a', x: 11, y: 0, width: 10, height: 10 }, // 1 unit gap < 2 unit gutter
    ]
    const result = checkCollision(candidate, others, GUTTER)
    expect(result.collides).toBe(true)
  })

  it('allows boxes separated by exactly the gutter', () => {
    const candidate = { x: 0, y: 0, width: 10, height: 10 }
    const others: PlacementWithId[] = [
      { id: 'a', x: 12, y: 0, width: 10, height: 10 }, // 2 unit gap = gutter
    ]
    const result = checkCollision(candidate, others, GUTTER)
    expect(result.collides).toBe(false)
  })

  it('excludes specified id from check', () => {
    const candidate = { x: 5, y: 5, width: 10, height: 10 }
    const others: PlacementWithId[] = [
      { id: 'self', x: 5, y: 5, width: 10, height: 10 },
    ]
    const result = checkCollision(candidate, others, GUTTER, 'self')
    expect(result.collides).toBe(false)
  })

  it('reports multiple collisions', () => {
    const candidate = { x: 5, y: 5, width: 30, height: 30 }
    const others: PlacementWithId[] = [
      { id: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', x: 20, y: 20, width: 10, height: 10 },
    ]
    const result = checkCollision(candidate, others, GUTTER)
    expect(result.collides).toBe(true)
    expect(result.collidingIds).toHaveLength(2)
  })
})

describe('clampToBounds', () => {
  it('clamps position to non-negative', () => {
    const result = clampToBounds({ x: -5, y: -3, width: 10, height: 10 })
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('passes through valid placement unchanged', () => {
    const placement = { x: 10, y: 20, width: 30, height: 25 }
    expect(clampToBounds(placement)).toEqual(placement)
  })
})

describe('findEmptyRect', () => {
  it('returns origin for empty canvas', () => {
    const result = findEmptyRect([], 20, 15, 2)
    expect(result).toEqual({ x: 2, y: 2 })
  })

  it('finds space to the right of existing component', () => {
    const others: PlacementWithId[] = [
      { id: 'a', x: 2, y: 2, width: 20, height: 15 },
    ]
    const result = findEmptyRect(others, 20, 15, 2)
    // Should find a spot that doesn't collide
    expect(result.x).toBeGreaterThanOrEqual(0)
    expect(result.y).toBeGreaterThanOrEqual(0)
    const check = checkCollision(
      { ...result, width: 20, height: 15 },
      others,
      2,
    )
    expect(check.collides).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/renderer/canvas/lib/__tests__/collision.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement collision module**

```typescript
// src/renderer/canvas/lib/collision.ts

export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

export interface PlacementWithId extends Placement {
  id: string
}

export interface CollisionResult {
  collides: boolean
  collidingIds: string[]
}

/**
 * AABB collision check with gutter enforcement.
 * Two rectangles collide if the gap between them is less than `gutter` grid units.
 */
export function checkCollision(
  candidate: Placement,
  others: PlacementWithId[],
  gutter: number,
  excludeId?: string,
): CollisionResult {
  const collidingIds: string[] = []

  for (const other of others) {
    if (excludeId && other.id === excludeId) continue

    const separatedX =
      candidate.x + candidate.width + gutter <= other.x ||
      other.x + other.width + gutter <= candidate.x
    const separatedY =
      candidate.y + candidate.height + gutter <= other.y ||
      other.y + other.height + gutter <= candidate.y

    if (!separatedX && !separatedY) {
      collidingIds.push(other.id)
    }
  }

  return { collides: collidingIds.length > 0, collidingIds }
}

/**
 * Clamp drag position: walk back along the drag vector until no collision.
 * Returns the furthest valid position along the vector.
 */
export function clampDragPosition(
  candidate: Placement,
  others: PlacementWithId[],
  gutter: number,
  excludeId: string,
  original: Placement,
): Placement {
  if (!checkCollision(candidate, others, gutter, excludeId).collides) {
    return candidate
  }

  // Binary search along the drag vector for the furthest valid point
  let lo = 0
  let hi = 1
  const dx = candidate.x - original.x
  const dy = candidate.y - original.y

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const test: Placement = {
      x: original.x + dx * mid,
      y: original.y + dy * mid,
      width: candidate.width,
      height: candidate.height,
    }
    if (checkCollision(test, others, gutter, excludeId).collides) {
      hi = mid
    } else {
      lo = mid
    }
  }

  return {
    x: Math.round(original.x + dx * lo),
    y: Math.round(original.y + dy * lo),
    width: candidate.width,
    height: candidate.height,
  }
}

/**
 * Clamp resize: shrink the delta until no collision, respecting the anchor point.
 */
export function clampResize(
  candidate: Placement,
  others: PlacementWithId[],
  gutter: number,
  excludeId: string,
  original: Placement,
): Placement {
  if (!checkCollision(candidate, others, gutter, excludeId).collides) {
    return candidate
  }

  // Binary search between original and candidate
  let lo = 0
  let hi = 1

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const test: Placement = {
      x: original.x + (candidate.x - original.x) * mid,
      y: original.y + (candidate.y - original.y) * mid,
      width: original.width + (candidate.width - original.width) * mid,
      height: original.height + (candidate.height - original.height) * mid,
    }
    if (checkCollision(test, others, gutter, excludeId).collides) {
      hi = mid
    } else {
      lo = mid
    }
  }

  return {
    x: Math.round(original.x + (candidate.x - original.x) * lo),
    y: Math.round(original.y + (candidate.y - original.y) * lo),
    width: Math.round(original.width + (candidate.width - original.width) * lo),
    height: Math.round(original.height + (candidate.height - original.height) * lo),
  }
}

/** Clamp placement to non-negative coordinates. */
export function clampToBounds(p: Placement): Placement {
  return {
    x: Math.max(0, p.x),
    y: Math.max(0, p.y),
    width: p.width,
    height: p.height,
  }
}

/**
 * Find an empty rectangle on the canvas that fits the given dimensions.
 * Scans candidate positions: right of each existing component, then below.
 * Falls back to below the lowest component.
 */
export function findEmptyRect(
  others: PlacementWithId[],
  width: number,
  height: number,
  gutter: number,
): { x: number; y: number } {
  if (others.length === 0) return { x: gutter, y: gutter }

  // Try right of each component, then below each component
  const candidates: Array<{ x: number; y: number }> = []
  for (const o of others) {
    candidates.push({ x: o.x + o.width + gutter, y: o.y })  // right
    candidates.push({ x: o.x, y: o.y + o.height + gutter }) // below
  }

  for (const pos of candidates) {
    const candidate: Placement = { ...pos, width, height }
    if (pos.x >= 0 && pos.y >= 0 && !checkCollision(candidate, others, gutter).collides) {
      return pos
    }
  }

  // Last resort: below everything
  const maxBottom = others.reduce((max, o) => Math.max(max, o.y + o.height), 0)
  return { x: gutter, y: maxBottom + gutter }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/renderer/canvas/lib/__tests__/collision.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Copy collision module to main process**

Copy `src/renderer/canvas/lib/collision.ts` → `src/main/agent/lib/collision.ts` (identical file — pure functions, no DOM dependencies).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/canvas/lib/collision.ts src/renderer/canvas/lib/__tests__/collision.test.ts src/main/agent/lib/collision.ts
git commit -m "feat(canvas): add AABB collision system with gutter enforcement"
```

---

## Task 2: Data Model — Layout Types + canvasStore `updatePlacement`

Extend the shared types and canvas store with the new layout model.

**Files:**
- Modify: `src/shared/blueprintTypes.ts`
- Modify: `src/renderer/store/canvasStore.ts`
- Modify: `src/main/agent/lib/canvasJson.ts`
- Modify: `src/preload/channels.ts`
- Modify: `src/main/ipc/project.ts` (add `canvas:update-placement` handler)
- Test: `src/shared/__tests__/blueprintTypes.test.ts` (add layout schema tests)
- Test: `src/renderer/__tests__/canvasStore.test.ts` (add updatePlacement test)

- [ ] **Step 1: Add layout types to `blueprintTypes.ts`**

Add after the existing `SearchResult` type (line 26):

```typescript
// src/shared/blueprintTypes.ts — append after line 26

export const BreakpointSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
})

export type Breakpoint = z.infer<typeof BreakpointSchema>

export const ComponentLayoutSchema = z.object({
  minWidth: z.number().positive().default(10),
  minHeight: z.number().positive().default(6),
  maxWidth: z.number().positive().optional(),
  maxHeight: z.number().positive().optional(),
  preferredAspectRatio: z.number().positive().optional(),
  breakpoints: z.array(BreakpointSchema).optional(),
  autoSize: z.boolean().default(true),
})

export type ComponentLayout = z.infer<typeof ComponentLayoutSchema>
```

- [ ] **Step 2: Write test for layout schema validation**

Add to `src/shared/__tests__/blueprintTypes.test.ts`:

```typescript
import { ComponentLayoutSchema } from '../blueprintTypes'

describe('ComponentLayoutSchema', () => {
  it('applies defaults for minimal input', () => {
    const result = ComponentLayoutSchema.parse({})
    expect(result.minWidth).toBe(10)
    expect(result.minHeight).toBe(6)
    expect(result.autoSize).toBe(true)
  })

  it('validates breakpoints', () => {
    const result = ComponentLayoutSchema.parse({
      breakpoints: [
        { name: 'compact', width: 20, height: 15 },
        { name: 'full', width: 50, height: 40 },
      ],
    })
    expect(result.breakpoints).toHaveLength(2)
  })

  it('rejects negative dimensions', () => {
    expect(() => ComponentLayoutSchema.parse({ minWidth: -5 })).toThrow()
  })
})
```

- [ ] **Step 3: Run test**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/shared/__tests__/blueprintTypes.test.ts`
Expected: PASS

- [ ] **Step 4: Add `updatePlacement` to canvasStore**

In `src/renderer/store/canvasStore.ts`, add to the `CanvasState` interface (after line 38):

```typescript
  updatePlacement(componentId: string, placement: Placement): void
```

Add the implementation inside the `create` call (after `removeComponent` at line 57):

```typescript
  updatePlacement: (componentId, placement) => {
    set((s) => ({
      components: s.components.map((c) =>
        c.componentId === componentId ? { ...c, placement } : c
      ),
    }))
    // Debounced persist to canvas.json via IPC
    debouncedPersistPlacement(componentId, placement)
  },
```

Add the debounce helper above the store creation:

```typescript
let persistTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<string, Placement>()

function debouncedPersistPlacement(componentId: string, placement: Placement) {
  pendingUpdates.set(componentId, placement)
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    for (const [id, p] of pendingUpdates) {
      window.electron.invoke('canvas:update-placement', { componentId: id, placement: p })
    }
    pendingUpdates.clear()
    persistTimer = null
  }, 500)
}
```

- [ ] **Step 5: Add `canvas:update-placement` IPC channel**

In `src/preload/channels.ts`, add `'canvas:update-placement'` to `ALLOWED_INVOKE_CHANNELS` array (after `'canvas:load'` at line 36, and after `'canvas:add-component'` at line 37):

```typescript
  'canvas:update-placement',
```

- [ ] **Step 6: Add IPC handler in `project.ts`**

In `src/main/ipc/project.ts`, add after the `canvas:load` handler (after line 199):

```typescript
  ipcMain.handle('canvas:update-placement', async (_e, args: {
    componentId: string
    placement: { x: number; y: number; width: number; height: number }
  }) => {
    const projectDir = process.cwd()
    await updateCanvasJson(projectDir, args.componentId, args.placement)
    return { success: true }
  })
```

Import `updateCanvasJson` from `'../../agent/lib/canvasJson'` at the top of the file.

- [ ] **Step 7: Run all tests**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run && npm run typecheck`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/shared/blueprintTypes.ts src/shared/__tests__/blueprintTypes.test.ts src/renderer/store/canvasStore.ts src/preload/channels.ts src/main/ipc/project.ts
git commit -m "feat(canvas): add ComponentLayout types, updatePlacement store method, and IPC channel"
```

---

## Task 3: Snap Guide Calculator

Pure computation hook that finds alignment lines between a moving/resizing component and all others.

**Files:**
- Create: `src/renderer/canvas/hooks/useSnapGuides.ts`
- Test: `src/renderer/canvas/hooks/__tests__/useSnapGuides.test.ts`

- [ ] **Step 1: Write tests for snap guide calculation**

```typescript
// src/renderer/canvas/hooks/__tests__/useSnapGuides.test.ts
import { describe, it, expect } from 'vitest'
import { calcSnapGuides, applySnap, type SnapGuide } from '../useSnapGuides'

describe('calcSnapGuides', () => {
  const others = [
    { id: 'a', x: 50, y: 10, width: 30, height: 20 },
  ]

  it('detects left-edge to left-edge alignment', () => {
    const candidate = { x: 50, y: 40, width: 20, height: 15 }
    const guides = calcSnapGuides(candidate, others, 1)
    const xGuides = guides.filter((g) => g.axis === 'x')
    expect(xGuides.some((g) => g.position === 50)).toBe(true)
  })

  it('detects right-edge to right-edge alignment', () => {
    const candidate = { x: 50, y: 40, width: 30, height: 15 }
    const guides = calcSnapGuides(candidate, others, 1)
    const xGuides = guides.filter((g) => g.axis === 'x')
    // right edges: candidate 80, other 80
    expect(xGuides.some((g) => g.position === 80)).toBe(true)
  })

  it('detects center-to-center alignment', () => {
    // other center x: 50 + 30/2 = 65
    const candidate = { x: 55, y: 40, width: 20, height: 15 }
    // candidate center x: 55 + 20/2 = 65
    const guides = calcSnapGuides(candidate, others, 1)
    const xGuides = guides.filter((g) => g.axis === 'x')
    expect(xGuides.some((g) => g.position === 65)).toBe(true)
  })

  it('returns empty array when nothing aligns within threshold', () => {
    const candidate = { x: 100, y: 100, width: 20, height: 15 }
    const guides = calcSnapGuides(candidate, others, 1)
    expect(guides).toEqual([])
  })
})

describe('applySnap', () => {
  it('snaps position to nearest guide within threshold', () => {
    const guides: SnapGuide[] = [{ axis: 'x', position: 50, type: 'left' }]
    const result = applySnap({ x: 49, y: 10 }, { width: 20, height: 15 }, guides, 1)
    expect(result.x).toBe(50)
  })

  it('does not snap when outside threshold', () => {
    const guides: SnapGuide[] = [{ axis: 'x', position: 50, type: 'left' }]
    const result = applySnap({ x: 45, y: 10 }, { width: 20, height: 15 }, guides, 1)
    expect(result.x).toBe(45)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/renderer/canvas/hooks/__tests__/useSnapGuides.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement snap guide calculator**

```typescript
// src/renderer/canvas/hooks/useSnapGuides.ts
import { useState, useCallback } from 'react'

interface Placement {
  x: number
  y: number
  width: number
  height: number
}

interface PlacementWithId extends Placement {
  id: string
}

export interface SnapGuide {
  axis: 'x' | 'y'
  position: number      // in grid units
  type: 'left' | 'right' | 'center' | 'top' | 'bottom'
}

/**
 * Calculate snap guides between a candidate placement and all other components.
 * Returns guides where candidate edges/center align within `threshold` grid units.
 */
export function calcSnapGuides(
  candidate: Placement,
  others: PlacementWithId[],
  threshold: number,
): SnapGuide[] {
  const guides: SnapGuide[] = []
  const cLeft = candidate.x
  const cRight = candidate.x + candidate.width
  const cCenterX = candidate.x + candidate.width / 2
  const cTop = candidate.y
  const cBottom = candidate.y + candidate.height
  const cCenterY = candidate.y + candidate.height / 2

  for (const other of others) {
    const oLeft = other.x
    const oRight = other.x + other.width
    const oCenterX = other.x + other.width / 2
    const oTop = other.y
    const oBottom = other.y + other.height
    const oCenterY = other.y + other.height / 2

    // X-axis guides (vertical lines)
    if (Math.abs(cLeft - oLeft) <= threshold) guides.push({ axis: 'x', position: oLeft, type: 'left' })
    if (Math.abs(cRight - oRight) <= threshold) guides.push({ axis: 'x', position: oRight, type: 'right' })
    if (Math.abs(cCenterX - oCenterX) <= threshold) guides.push({ axis: 'x', position: oCenterX, type: 'center' })
    if (Math.abs(cLeft - oRight) <= threshold) guides.push({ axis: 'x', position: oRight, type: 'left' })
    if (Math.abs(cRight - oLeft) <= threshold) guides.push({ axis: 'x', position: oLeft, type: 'right' })

    // Y-axis guides (horizontal lines)
    if (Math.abs(cTop - oTop) <= threshold) guides.push({ axis: 'y', position: oTop, type: 'top' })
    if (Math.abs(cBottom - oBottom) <= threshold) guides.push({ axis: 'y', position: oBottom, type: 'bottom' })
    if (Math.abs(cCenterY - oCenterY) <= threshold) guides.push({ axis: 'y', position: oCenterY, type: 'center' })
    if (Math.abs(cTop - oBottom) <= threshold) guides.push({ axis: 'y', position: oBottom, type: 'top' })
    if (Math.abs(cBottom - oTop) <= threshold) guides.push({ axis: 'y', position: oTop, type: 'bottom' })
  }

  // Deduplicate
  const seen = new Set<string>()
  return guides.filter((g) => {
    const key = `${g.axis}:${g.position}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Apply snap: adjust position so that the nearest edge/center snaps to a guide.
 */
export function applySnap(
  pos: { x: number; y: number },
  size: { width: number; height: number },
  guides: SnapGuide[],
  threshold: number,
): { x: number; y: number } {
  let { x, y } = pos

  for (const g of guides) {
    if (g.axis === 'x') {
      if (g.type === 'left' && Math.abs(x - g.position) <= threshold) x = g.position
      else if (g.type === 'right' && Math.abs(x + size.width - g.position) <= threshold) x = g.position - size.width
      else if (g.type === 'center' && Math.abs(x + size.width / 2 - g.position) <= threshold) x = g.position - size.width / 2
    } else {
      if (g.type === 'top' && Math.abs(y - g.position) <= threshold) y = g.position
      else if (g.type === 'bottom' && Math.abs(y + size.height - g.position) <= threshold) y = g.position - size.height
      else if (g.type === 'center' && Math.abs(y + size.height / 2 - g.position) <= threshold) y = g.position - size.height / 2
    }
  }

  return { x, y }
}

/** React hook wrapping the snap guide state for use during drag/resize. */
export function useSnapGuides() {
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([])

  const updateGuides = useCallback((
    candidate: Placement,
    others: PlacementWithId[],
    threshold = 1,
  ) => {
    const guides = calcSnapGuides(candidate, others, threshold)
    setActiveGuides(guides)
    return guides
  }, [])

  const clearGuides = useCallback(() => setActiveGuides([]), [])

  return { activeGuides, updateGuides, clearGuides }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/renderer/canvas/hooks/__tests__/useSnapGuides.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/hooks/useSnapGuides.ts src/renderer/canvas/hooks/__tests__/useSnapGuides.test.ts
git commit -m "feat(canvas): add snap guide calculator with edge and center alignment"
```

---

## Task 4: Smart Placement Solver (main process)

Replaces the vertical-stacking logic in `writeComponent` with semantic affinity-based placement.

**Files:**
- Create: `src/main/agent/lib/placementSolver.ts`
- Modify: `src/main/agent/tools/writeComponent.ts:94-110`
- Test: `src/main/agent/lib/__tests__/placementSolver.test.ts`

- [ ] **Step 1: Write tests for placement solver**

```typescript
// src/main/agent/lib/__tests__/placementSolver.test.ts
import { describe, it, expect } from 'vitest'
import { solvePlacement, scoreAffinity } from '../placementSolver'
import type { PlacementWithId } from '../collision'

describe('scoreAffinity', () => {
  it('scores higher for matching tags', () => {
    const a = { tags: ['weather', 'dashboard'], description: 'Weather display' }
    const b = { tags: ['weather', 'forecast'], description: 'Forecast chart' }
    const c = { tags: ['finance', 'stocks'], description: 'Stock ticker' }
    expect(scoreAffinity(a, b)).toBeGreaterThan(scoreAffinity(a, c))
  })

  it('returns 0 for no overlap', () => {
    const a = { tags: ['weather'], description: 'Weather' }
    const b = { tags: ['finance'], description: 'Stocks' }
    expect(scoreAffinity(a, b)).toBe(0)
  })
})

describe('solvePlacement', () => {
  it('places first component at gutter offset', () => {
    const result = solvePlacement(
      { tags: ['test'], description: 'test component' },
      { width: 30, height: 25 },
      [],
      [],
    )
    expect(result).toEqual({ x: 2, y: 2 })
  })

  it('places related component adjacent to anchor', () => {
    const existing: PlacementWithId[] = [
      { id: 'weather', x: 2, y: 2, width: 30, height: 25 },
    ]
    const manifests = [
      { id: 'weather', tags: ['weather', 'dashboard'], description: 'Weather widget' },
    ]
    const result = solvePlacement(
      { tags: ['weather', 'forecast'], description: 'Forecast chart' },
      { width: 30, height: 20 },
      existing,
      manifests,
    )
    // Should be placed adjacent (right of weather by default)
    expect(result.x).toBe(2 + 30 + 2) // anchor.x + anchor.width + gutter
    expect(result.y).toBe(2)
  })

  it('falls back to below when right is blocked', () => {
    const existing: PlacementWithId[] = [
      { id: 'a', x: 2, y: 2, width: 30, height: 25 },
      { id: 'b', x: 34, y: 2, width: 200, height: 25 }, // blocks right
    ]
    const manifests = [
      { id: 'a', tags: ['test'], description: 'test' },
      { id: 'b', tags: ['blocker'], description: 'blocker' },
    ]
    const result = solvePlacement(
      { tags: ['test'], description: 'test related' },
      { width: 30, height: 20 },
      existing,
      manifests,
    )
    // Should be placed below 'a'
    expect(result.y).toBe(2 + 25 + 2) // anchor.y + anchor.height + gutter
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/main/agent/lib/__tests__/placementSolver.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement placement solver**

```typescript
// src/main/agent/lib/placementSolver.ts
import { checkCollision, findEmptyRect, type Placement, type PlacementWithId } from './collision'

const GUTTER = 2

interface ManifestInfo {
  id: string
  tags: string[]
  description: string
}

interface NewComponentInfo {
  tags: string[]
  description: string
}

/**
 * Score semantic affinity between two components based on tag overlap
 * and keyword intersection in descriptions.
 */
export function scoreAffinity(
  a: { tags: string[]; description: string },
  b: { tags: string[]; description: string },
): number {
  // Tag overlap (each matching tag = 2 points)
  const tagSet = new Set(a.tags.map((t) => t.toLowerCase()))
  let score = 0
  for (const tag of b.tags) {
    if (tagSet.has(tag.toLowerCase())) score += 2
  }

  // Description keyword overlap (each shared word = 0.5 points, minimum 3 chars)
  const wordsA = new Set(
    a.description.toLowerCase().split(/\W+/).filter((w) => w.length >= 3)
  )
  for (const word of b.description.toLowerCase().split(/\W+/)) {
    if (word.length >= 3 && wordsA.has(word)) score += 0.5
  }

  return score
}

/**
 * Find the best position for a new component on the canvas.
 *
 * 1. Score affinity against all existing components
 * 2. Generate candidate positions around the highest-affinity anchor
 * 3. Pick the first collision-free candidate
 */
export function solvePlacement(
  newComponent: NewComponentInfo,
  size: { width: number; height: number },
  existingPlacements: PlacementWithId[],
  existingManifests: ManifestInfo[],
): { x: number; y: number } {
  if (existingPlacements.length === 0) {
    return { x: GUTTER, y: GUTTER }
  }

  // Score affinity and sort by score descending
  const scored = existingManifests
    .map((m) => ({
      id: m.id,
      score: scoreAffinity(newComponent, m),
      placement: existingPlacements.find((p) => p.id === m.id),
    }))
    .filter((s) => s.placement != null)
    .sort((a, b) => b.score - a.score)

  // Try each anchor in affinity order
  for (const { placement: anchor } of scored) {
    if (!anchor) continue

    // Generate 4 candidates: right, below, left, above
    const candidates: Array<{ x: number; y: number }> = [
      { x: anchor.x + anchor.width + GUTTER, y: anchor.y },                          // right
      { x: anchor.x, y: anchor.y + anchor.height + GUTTER },                         // below
      { x: anchor.x - size.width - GUTTER, y: anchor.y },                            // left
      { x: anchor.x, y: anchor.y - size.height - GUTTER },                           // above
    ]

    for (const pos of candidates) {
      if (pos.x < 0 || pos.y < 0) continue
      const candidate: Placement = { ...pos, width: size.width, height: size.height }
      if (!checkCollision(candidate, existingPlacements, GUTTER).collides) {
        return pos
      }
    }
  }

  // Last resort: find any empty rect
  return findEmptyRect(existingPlacements, size.width, size.height, GUTTER)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/main/agent/lib/__tests__/placementSolver.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate solver into `writeComponent.ts`**

Replace lines 94-110 of `src/main/agent/tools/writeComponent.ts` with:

```typescript
      // 7. Calculate placement — use smart solver if no explicit placement
      const layout = input.manifest.layout as { minWidth?: number; minHeight?: number } | undefined
      const defaultSize = input.manifest.defaultSize as { width?: number; height?: number } | undefined
      const componentWidth = defaultSize?.width ?? layout?.minWidth ?? 50
      const componentHeight = defaultSize?.height ?? layout?.minHeight ?? 25
      let placement: Placement
      if (input.placement) {
        placement = input.placement
      } else {
        const canvas = await readCanvasJson(projectDir)
        const existingPlacements = canvas.components.map((c) => ({ id: c.componentId, ...c.placement }))

        // Load manifests for affinity scoring
        const { readFile } = await import('fs/promises')
        const existingManifests: Array<{ id: string; tags: string[]; description: string }> = []
        for (const entry of canvas.components) {
          try {
            const manifestRaw = await readFile(
              join(resolve(projectDir, 'components'), entry.componentId, 'manifest.json'),
              'utf-8',
            )
            const m = JSON.parse(manifestRaw)
            existingManifests.push({
              id: entry.componentId,
              tags: Array.isArray(m.tags) ? m.tags : [],
              description: typeof m.description === 'string' ? m.description : '',
            })
          } catch {
            existingManifests.push({ id: entry.componentId, tags: [], description: '' })
          }
        }

        const pos = solvePlacement(
          {
            tags: Array.isArray(input.manifest.tags) ? input.manifest.tags as string[] : [],
            description: typeof input.manifest.description === 'string' ? input.manifest.description as string : '',
          },
          { width: componentWidth, height: componentHeight },
          existingPlacements,
          existingManifests,
        )
        placement = { ...pos, width: componentWidth, height: componentHeight }
      }
```

Add import at top of `writeComponent.ts`:

```typescript
import { solvePlacement } from '../lib/placementSolver'
```

- [ ] **Step 6: Run all tests + typecheck**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run && npm run typecheck`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/main/agent/lib/placementSolver.ts src/main/agent/lib/__tests__/placementSolver.test.ts src/main/agent/tools/writeComponent.ts
git commit -m "feat(agent): smart placement solver with semantic affinity scoring"
```

---

## Task 5: CanvasItem Component with Drag (using @dnd-kit)

Extract the inline canvas item div into a proper component with drag support.

**Files:**
- Create: `src/renderer/canvas/components/CanvasItem.tsx`
- Create: `src/renderer/canvas/components/SnapGuideOverlay.tsx`
- Modify: `src/renderer/canvas/SlateCanvas.tsx` (wrap in DndContext, use CanvasItem)
- Modify: `package.json` (add @dnd-kit deps)

- [ ] **Step 1: Install @dnd-kit**

```bash
cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npm install @dnd-kit/core @dnd-kit/utilities
```

- [ ] **Step 2: Create SnapGuideOverlay component**

```typescript
// src/renderer/canvas/components/SnapGuideOverlay.tsx
import React from 'react'
import type { SnapGuide } from '../hooks/useSnapGuides'

const GRID_PX = 8

interface Props {
  guides: SnapGuide[]
  canvasHeight: number  // in pixels
  canvasWidth: number   // in pixels
}

export function SnapGuideOverlay({ guides, canvasHeight, canvasWidth }: Props) {
  if (guides.length === 0) return null

  return (
    <>
      {guides.map((guide, i) => {
        if (guide.axis === 'x') {
          return (
            <div
              key={`${guide.axis}-${guide.position}-${i}`}
              className="absolute top-0 w-px bg-blue-400/50 pointer-events-none"
              style={{
                left: guide.position * GRID_PX,
                height: canvasHeight,
              }}
            />
          )
        }
        return (
          <div
            key={`${guide.axis}-${guide.position}-${i}`}
            className="absolute left-0 h-px bg-blue-400/50 pointer-events-none"
            style={{
              top: guide.position * GRID_PX,
              width: canvasWidth,
            }}
          />
        )
      })}
    </>
  )
}
```

- [ ] **Step 3: Create CanvasItem component with drag**

```typescript
// src/renderer/canvas/components/CanvasItem.tsx
import React, { useCallback, useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { type CanvasComponent, type Placement } from '../../store/canvasStore'
import { DynamicComponent } from '../../sandbox/DynamicComponent'

const GRID_PX = 8

interface Props {
  component: CanvasComponent
  isSelected: boolean
  onSelect: (id: string) => void
}

export function CanvasItem({ component, isSelected, onSelect }: Props) {
  const { x, y, width, height } = component.placement
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.componentId,
    data: { placement: component.placement },
  })

  const style: React.CSSProperties = {
    left: x * GRID_PX,
    top: y * GRID_PX,
    width: width * GRID_PX,
    height: height * GRID_PX,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      className={`absolute bg-surface rounded-lg shadow-lg overflow-hidden transition-shadow ${
        isSelected ? 'ring-2 ring-primary/50' : ''
      } ${isDragging ? 'shadow-2xl' : ''}`}
      style={style}
      onClick={() => onSelect(component.componentId)}
    >
      {/* Drag handle — top bar */}
      <div
        className="h-6 bg-surface-hover cursor-grab active:cursor-grabbing flex items-center px-2 select-none"
        {...listeners}
        {...attributes}
      >
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-muted/40" />
          <div className="w-1 h-1 rounded-full bg-muted/40" />
          <div className="w-1 h-1 rounded-full bg-muted/40" />
        </div>
        <span className="ml-2 text-[10px] text-muted/60 truncate">
          {typeof component.manifest === 'object' && component.manifest !== null && 'name' in component.manifest
            ? String((component.manifest as Record<string, unknown>).name)
            : component.componentId}
        </span>
      </div>
      {/* Component content */}
      <div className="w-full" style={{ height: `calc(100% - 24px)` }}>
        <DynamicComponent bundle={component.bundle} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite SlateCanvas with DndContext**

Replace the entire content of `src/renderer/canvas/SlateCanvas.tsx`:

```typescript
// src/renderer/canvas/SlateCanvas.tsx
import React, { useState, useCallback, useRef } from 'react'
import {
  DndContext,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useCanvasStore, type CanvasComponent, type Placement } from '../store/canvasStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'
import { BuildingCard } from './building/BuildingCard'
import { CanvasItem } from './components/CanvasItem'
import { SnapGuideOverlay } from './components/SnapGuideOverlay'
import { useSnapGuides, calcSnapGuides, applySnap } from './hooks/useSnapGuides'
import { checkCollision, clampDragPosition, clampToBounds, type PlacementWithId } from './lib/collision'

const GRID_PX = 8
const GUTTER = 2
const SNAP_THRESHOLD = 1

export function SlateCanvas() {
  const components = useCanvasStore((s) => s.components)
  const preview = useCanvasStore((s) => s.preview)
  const buildingCards = useCanvasStore((s) => s.buildingCards)
  const updatePlacement = useCanvasStore((s) => s.updatePlacement)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { activeGuides, updateGuides, clearGuides } = useSnapGuides()
  const canvasRef = useRef<HTMLDivElement>(null)

  const shortcut = window.electron.platform === 'darwin' ? '⌘K' : 'Ctrl+K'
  const isEmpty = components.length === 0 && !preview && buildingCards.length === 0

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const allPlacements: PlacementWithId[] = components.map((c) => ({
    id: c.componentId,
    ...c.placement,
  }))

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { active, delta } = event
    const original = (active.data.current as { placement: Placement }).placement
    const tentative: Placement = {
      x: Math.round(original.x + delta.x / GRID_PX),
      y: Math.round(original.y + delta.y / GRID_PX),
      width: original.width,
      height: original.height,
    }
    updateGuides(tentative, allPlacements.filter((p) => p.id !== active.id), SNAP_THRESHOLD)
  }, [allPlacements, updateGuides])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    clearGuides()
    const { active, delta } = event
    const original = (active.data.current as { placement: Placement }).placement
    const tentative: Placement = {
      x: Math.round(original.x + delta.x / GRID_PX),
      y: Math.round(original.y + delta.y / GRID_PX),
      width: original.width,
      height: original.height,
    }

    // Apply snap guides
    const others = allPlacements.filter((p) => p.id !== active.id)
    const guides = calcSnapGuides(tentative, others, SNAP_THRESHOLD)
    const snapped = applySnap(tentative, tentative, guides, SNAP_THRESHOLD)
    const snappedPlacement: Placement = { ...snapped, width: original.width, height: original.height }

    // Clamp to non-overlapping + non-negative
    const clamped = clampDragPosition(
      clampToBounds(snappedPlacement),
      others,
      GUTTER,
      String(active.id),
      original,
    )

    updatePlacement(String(active.id), clamped)
  }, [allPlacements, clearGuides, updatePlacement])

  // Canvas dimensions for guide overlay
  const canvasWidth = canvasRef.current?.scrollWidth ?? 2000
  const canvasHeight = canvasRef.current?.scrollHeight ?? 2000

  return (
    <div ref={canvasRef} className="flex-1 bg-background relative overflow-auto">
      {isEmpty ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center select-none">
            <img
              src={new URL('../assets/logo.png', import.meta.url).href}
              alt=""
              className="h-12 w-auto mx-auto mb-4 opacity-20"
              draggable={false}
            />
            <p className="text-muted text-base font-medium">Your Slate canvas</p>
            <p className="text-muted/60 text-sm mt-1">
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-surface border border-border text-muted rounded text-xs">
                {shortcut}
              </kbd>
              {' '}to describe a component
            </p>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={clearGuides}
        >
          {components.map((comp) => (
            <CanvasItem
              key={comp.componentId}
              component={comp}
              isSelected={selectedId === comp.componentId}
              onSelect={setSelectedId}
            />
          ))}
          {buildingCards.map((card) => (
            <BuildingCard key={card.buildId} card={card} />
          ))}
          {preview && (
            <div
              className="absolute bg-surface rounded-lg shadow-lg overflow-auto ring-2 ring-primary/30"
              style={preview.placement?.x != null ? {
                left: preview.placement.x * GRID_PX,
                top: (preview.placement.y ?? 0) * GRID_PX,
                width: (preview.placement.width ?? 4) * GRID_PX,
                height: (preview.placement.height ?? 4) * GRID_PX,
              } : {
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '80%',
                minHeight: '300px',
              }}
            >
              <DynamicComponent bundle={preview.bundle} />
            </div>
          )}
          <SnapGuideOverlay
            guides={activeGuides}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        </DndContext>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run`
Expected: All pass (existing tests should not break)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/renderer/canvas/SlateCanvas.tsx src/renderer/canvas/components/CanvasItem.tsx src/renderer/canvas/components/SnapGuideOverlay.tsx
git commit -m "feat(canvas): add drag support with @dnd-kit, snap guides, and collision blocking"
```

---

## Task 6: Component Removal from Canvas

Add the ability to remove a component from the canvas via a UI button. The store already has `removeComponent` but there's no UI or IPC to delete from disk + canvas.json.

**Files:**
- Modify: `src/renderer/canvas/components/CanvasItem.tsx` (add remove button to drag handle bar)
- Modify: `src/renderer/store/canvasStore.ts` (no change needed — `removeComponent` already exists)
- Modify: `src/preload/channels.ts` (add `canvas:remove-component` channel)
- Modify: `src/main/ipc/project.ts` (add handler to remove from canvas.json + optionally delete from disk)

- [ ] **Step 1: Add `canvas:remove-component` IPC channel**

In `src/preload/channels.ts`, add `'canvas:remove-component'` to `ALLOWED_INVOKE_CHANNELS` (after `'canvas:update-placement'`):

```typescript
  'canvas:remove-component',
```

- [ ] **Step 2: Add IPC handler in `project.ts`**

In `src/main/ipc/project.ts`, add after the `canvas:update-placement` handler:

```typescript
  ipcMain.handle('canvas:remove-component', async (_e, args: {
    componentId: string
    deleteFiles?: boolean
  }) => {
    const projectDir = process.cwd()
    try { safeComponentId(args.componentId) } catch { return { success: false, error: 'Invalid componentId' } }
    await removeFromCanvasJson(projectDir, args.componentId)
    if (args.deleteFiles) {
      const componentDir = path.join(projectDir, 'components', args.componentId)
      await fs.rm(componentDir, { recursive: true, force: true })
    }
    return { success: true }
  })
```

Import `removeFromCanvasJson` from `'../../agent/lib/canvasJson'` (alongside the existing `updateCanvasJson` import).

- [ ] **Step 3: Add remove button to CanvasItem drag handle**

In `src/renderer/canvas/components/CanvasItem.tsx`, add an `onRemove` prop:

Update Props interface to include:
```typescript
  onRemove: (componentId: string) => void
```

Add a remove button in the drag handle bar (right side), after the component name span:

```typescript
        <button
          className="ml-auto p-0.5 rounded hover:bg-error/20 text-muted/40 hover:text-error transition-colors"
          title="Remove component"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(component.componentId)
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
```

- [ ] **Step 4: Wire up removal in SlateCanvas**

In `src/renderer/canvas/SlateCanvas.tsx`, add the remove handler:

```typescript
  const removeComponent = useCanvasStore((s) => s.removeComponent)

  const handleRemove = useCallback((componentId: string) => {
    window.electron.invoke('canvas:remove-component', { componentId, deleteFiles: false })
    removeComponent(componentId)
    if (selectedId === componentId) setSelectedId(null)
  }, [removeComponent, selectedId])
```

Pass `onRemove={handleRemove}` to each `<CanvasItem>`.

- [ ] **Step 5: Run typecheck + tests**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npm run typecheck && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/preload/channels.ts src/main/ipc/project.ts src/renderer/canvas/components/CanvasItem.tsx src/renderer/canvas/SlateCanvas.tsx
git commit -m "feat(canvas): add component removal from canvas via X button"
```

---

## Task 7: Resize System

Custom pointer-event resize with 8 handles, constraint clamping, aspect ratio, breakpoint detents, and collision blocking.

**Files:**
- Create: `src/renderer/canvas/components/ResizeHandle.tsx`
- Create: `src/renderer/canvas/hooks/useResize.ts`
- Modify: `src/renderer/canvas/components/CanvasItem.tsx` (add resize handles)
- Test: `src/renderer/canvas/hooks/__tests__/useResize.test.ts`

- [ ] **Step 1: Write tests for resize constraint logic**

```typescript
// src/renderer/canvas/hooks/__tests__/useResize.test.ts
import { describe, it, expect } from 'vitest'
import { applyConstraints, findNearestDetent, type ResizeConstraints } from '../useResize'

describe('applyConstraints', () => {
  const constraints: ResizeConstraints = {
    minWidth: 10,
    minHeight: 6,
    maxWidth: 80,
    maxHeight: 60,
  }

  it('clamps below minimum', () => {
    const result = applyConstraints({ width: 5, height: 3 }, constraints)
    expect(result.width).toBe(10)
    expect(result.height).toBe(6)
  })

  it('clamps above maximum', () => {
    const result = applyConstraints({ width: 100, height: 80 }, constraints)
    expect(result.width).toBe(80)
    expect(result.height).toBe(60)
  })

  it('preserves aspect ratio on corner drag when set', () => {
    const result = applyConstraints(
      { width: 40, height: 30 },
      { ...constraints, preferredAspectRatio: 2 },
      true, // isCorner
    )
    // aspect 2 means width = 2 * height
    expect(result.width / result.height).toBeCloseTo(2, 1)
  })

  it('does not enforce aspect ratio on edge drag', () => {
    const result = applyConstraints(
      { width: 40, height: 30 },
      { ...constraints, preferredAspectRatio: 2 },
      false, // not corner
    )
    expect(result.width).toBe(40)
    expect(result.height).toBe(30)
  })
})

describe('findNearestDetent', () => {
  const breakpoints = [
    { name: 'compact', width: 20, height: 15 },
    { name: 'medium', width: 35, height: 25 },
    { name: 'full', width: 50, height: 40 },
  ]

  it('snaps to nearest breakpoint within threshold', () => {
    const result = findNearestDetent({ width: 21, height: 16 }, breakpoints, 2)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('compact')
  })

  it('returns null when outside threshold', () => {
    const result = findNearestDetent({ width: 30, height: 30 }, breakpoints, 2)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/renderer/canvas/hooks/__tests__/useResize.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useResize hook**

```typescript
// src/renderer/canvas/hooks/useResize.ts
import { useState, useCallback, useRef } from 'react'
import type { Placement } from '../../store/canvasStore'
import { checkCollision, clampResize, clampToBounds, type PlacementWithId } from '../lib/collision'

const GRID_PX = 8
const GUTTER = 2

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface ResizeConstraints {
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
  preferredAspectRatio?: number
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

/** Apply min/max constraints and optional aspect ratio. */
export function applyConstraints(
  size: { width: number; height: number },
  constraints: ResizeConstraints,
  isCorner = false,
): { width: number; height: number } {
  let { width, height } = size

  // Clamp to min/max
  width = Math.max(constraints.minWidth, width)
  height = Math.max(constraints.minHeight, height)
  if (constraints.maxWidth) width = Math.min(constraints.maxWidth, width)
  if (constraints.maxHeight) height = Math.min(constraints.maxHeight, height)

  // Aspect ratio enforcement on corner drag only
  if (isCorner && constraints.preferredAspectRatio) {
    const ratio = constraints.preferredAspectRatio
    // Adjust height to match width / ratio
    const targetHeight = width / ratio
    if (targetHeight >= constraints.minHeight && (!constraints.maxHeight || targetHeight <= constraints.maxHeight)) {
      height = targetHeight
    } else {
      // Adjust width to match instead
      width = height * ratio
      width = Math.max(constraints.minWidth, width)
      if (constraints.maxWidth) width = Math.min(constraints.maxWidth, width)
    }
  }

  return { width: Math.round(width), height: Math.round(height) }
}

/** Find nearest breakpoint detent within threshold grid units. */
export function findNearestDetent(
  size: { width: number; height: number },
  breakpoints: Breakpoint[],
  threshold: number,
): DetentInfo | null {
  let nearest: DetentInfo | null = null
  let minDist = Infinity

  for (const bp of breakpoints) {
    const dist = Math.sqrt(
      (size.width - bp.width) ** 2 + (size.height - bp.height) ** 2,
    )
    if (dist <= threshold && dist < minDist) {
      minDist = dist
      nearest = bp
    }
  }

  return nearest
}

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
  onUpdate: (componentId: string, placement: Placement) => void,
) {
  const [state, setState] = useState<ResizeState>({
    isResizing: false,
    direction: null,
    tentativePlacement: null,
    detent: null,
  })
  const startRef = useRef<{ mouseX: number; mouseY: number; placement: Placement } | null>(null)

  const isCornerDirection = (dir: ResizeDirection) => ['ne', 'nw', 'se', 'sw'].includes(dir)

  const onPointerDown = useCallback((e: React.PointerEvent, direction: ResizeDirection) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = { mouseX: e.clientX, mouseY: e.clientY, placement: { ...placement } }
    setState({ isResizing: true, direction, tentativePlacement: placement, detent: null })
  }, [placement])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current || !state.direction) return
    const { mouseX, mouseY, placement: orig } = startRef.current
    const dx = Math.round((e.clientX - mouseX) / GRID_PX)
    const dy = Math.round((e.clientY - mouseY) / GRID_PX)
    const dir = state.direction

    let newX = orig.x
    let newY = orig.y
    let newW = orig.width
    let newH = orig.height

    // Compute new dimensions based on direction
    if (dir.includes('e')) newW = orig.width + dx
    if (dir.includes('w')) { newW = orig.width - dx; newX = orig.x + dx }
    if (dir.includes('s')) newH = orig.height + dy
    if (dir.includes('n')) { newH = orig.height - dy; newY = orig.y + dy }

    // Apply constraints
    const constrained = applyConstraints({ width: newW, height: newH }, constraints, isCornerDirection(dir))

    // Recalculate position if width/height were clamped on left/top handles
    if (dir.includes('w')) newX = orig.x + orig.width - constrained.width
    if (dir.includes('n')) newY = orig.y + orig.height - constrained.height

    // Breakpoint detent
    const detent = findNearestDetent(constrained, breakpoints, 2)
    const finalSize = detent ? { width: detent.width, height: detent.height } : constrained
    if (detent) {
      if (dir.includes('w')) newX = orig.x + orig.width - finalSize.width
      if (dir.includes('n')) newY = orig.y + orig.height - finalSize.height
    }

    let tentative: Placement = clampToBounds({ x: newX, y: newY, width: finalSize.width, height: finalSize.height })

    // Collision check — clamp resize if it would overlap
    tentative = clampResize(tentative, allPlacements, GUTTER, componentId, orig)

    setState((s) => ({ ...s, tentativePlacement: tentative, detent }))
  }, [state.direction, constraints, breakpoints, allPlacements, componentId])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    if (state.tentativePlacement) {
      onUpdate(componentId, state.tentativePlacement)
    }
    startRef.current = null
    setState({ isResizing: false, direction: null, tentativePlacement: null, detent: null })
  }, [state.tentativePlacement, componentId, onUpdate])

  return {
    ...state,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/renderer/canvas/hooks/__tests__/useResize.test.ts`
Expected: PASS

- [ ] **Step 5: Create ResizeHandle component**

```typescript
// src/renderer/canvas/components/ResizeHandle.tsx
import React from 'react'
import type { ResizeDirection } from '../hooks/useResize'

interface Props {
  direction: ResizeDirection
  onPointerDown: (e: React.PointerEvent, direction: ResizeDirection) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}

const CURSOR_MAP: Record<ResizeDirection, string> = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
}

const POSITION_MAP: Record<ResizeDirection, string> = {
  n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2',
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
}

export function ResizeHandle({ direction, onPointerDown, onPointerMove, onPointerUp }: Props) {
  return (
    <div
      className={`absolute w-3 h-3 bg-primary/80 border border-white rounded-sm z-10 ${CURSOR_MAP[direction]} ${POSITION_MAP[direction]} hover:bg-primary`}
      onPointerDown={(e) => onPointerDown(e, direction)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
```

- [ ] **Step 6: Add resize handles to CanvasItem**

Update `src/renderer/canvas/components/CanvasItem.tsx` to import and render resize handles when selected. Add these imports:

```typescript
import { useResize, type ResizeDirection } from '../hooks/useResize'
import { ResizeHandle } from './ResizeHandle'
import type { PlacementWithId } from '../lib/collision'
```

Update the Props interface:

```typescript
interface Props {
  component: CanvasComponent
  isSelected: boolean
  onSelect: (id: string) => void
  allPlacements: PlacementWithId[]
  onUpdatePlacement: (componentId: string, placement: Placement) => void
}
```

Inside the component function, add the resize hook before the return:

```typescript
  const layout = (typeof component.manifest === 'object' && component.manifest !== null && 'layout' in component.manifest)
    ? component.manifest.layout as { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number; preferredAspectRatio?: number; breakpoints?: Array<{ name: string; width: number; height: number }>; autoSize?: boolean }
    : undefined

  const resize = useResize(
    component.componentId,
    component.placement,
    {
      minWidth: layout?.minWidth ?? 10,
      minHeight: layout?.minHeight ?? 6,
      maxWidth: layout?.maxWidth,
      maxHeight: layout?.maxHeight,
      preferredAspectRatio: layout?.preferredAspectRatio,
    },
    layout?.breakpoints ?? [],
    allPlacements,
    onUpdatePlacement,
  )

  const activePlacement = resize.tentativePlacement ?? component.placement
  const { x: ax, y: ay, width: aw, height: ah } = activePlacement
```

Update the style to use `activePlacement` and update the return to render resize handles when selected:

```typescript
  const style: React.CSSProperties = {
    left: ax * GRID_PX,
    top: ay * GRID_PX,
    width: aw * GRID_PX,
    height: ah * GRID_PX,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    zIndex: isDragging || resize.isResizing ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }
```

Add resize handles inside the main div, after the component content div:

```typescript
      {/* Resize handles — visible on selection */}
      {isSelected && !isDragging && (
        <>
          {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map((dir) => (
            <ResizeHandle
              key={dir}
              direction={dir}
              onPointerDown={resize.onPointerDown}
              onPointerMove={resize.onPointerMove}
              onPointerUp={resize.onPointerUp}
            />
          ))}
          {resize.detent && (
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-primary font-medium bg-surface px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
              {resize.detent.name} ({resize.detent.width}×{resize.detent.height})
            </div>
          )}
          {resize.isResizing && resize.tentativePlacement && (
            <div className="absolute -top-6 right-0 text-[10px] text-muted bg-surface px-2 py-0.5 rounded shadow-sm">
              {resize.tentativePlacement.width}×{resize.tentativePlacement.height}
            </div>
          )}
        </>
      )}
```

Update `SlateCanvas.tsx` to pass the new props to `CanvasItem`:

```typescript
            <CanvasItem
              key={comp.componentId}
              component={comp}
              isSelected={selectedId === comp.componentId}
              onSelect={setSelectedId}
              allPlacements={allPlacements}
              onUpdatePlacement={updatePlacement}
            />
```

- [ ] **Step 7: Run typecheck + tests**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npm run typecheck && npx vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/renderer/canvas/components/ResizeHandle.tsx src/renderer/canvas/hooks/useResize.ts src/renderer/canvas/hooks/__tests__/useResize.test.ts src/renderer/canvas/components/CanvasItem.tsx src/renderer/canvas/SlateCanvas.tsx
git commit -m "feat(canvas): add constraint-aware resize with breakpoint detents and collision blocking"
```

---

## Task 8: Auto-Size System

ResizeObserver-based auto-sizing with grow-only behavior after first render.

**Files:**
- Create: `src/renderer/canvas/hooks/useAutoSize.ts`
- Modify: `src/renderer/canvas/components/CanvasItem.tsx` (wrap DynamicComponent in measurement container)

- [ ] **Step 1: Implement useAutoSize hook**

```typescript
// src/renderer/canvas/hooks/useAutoSize.ts
import { useEffect, useRef, useCallback } from 'react'
import type { Placement } from '../../store/canvasStore'
import { checkCollision, type PlacementWithId } from '../lib/collision'

const GRID_PX = 8
const GUTTER = 2
const DEBOUNCE_MS = 200

interface AutoSizeConfig {
  enabled: boolean
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
}

/**
 * Measures a component's natural content size and adjusts placement accordingly.
 * - First render: sets size based on DOM measurement
 * - After mount: grow-only (never auto-shrink)
 */
export function useAutoSize(
  componentId: string,
  placement: Placement,
  config: AutoSizeConfig,
  allPlacements: PlacementWithId[],
  onUpdate: (componentId: string, placement: Placement) => void,
) {
  const contentRef = useRef<HTMLDivElement>(null)
  const hasInitialized = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tryGrow = useCallback((contentWidth: number, contentHeight: number) => {
    const neededW = Math.max(config.minWidth, Math.ceil(contentWidth / GRID_PX))
    const neededH = Math.max(config.minHeight, Math.ceil(contentHeight / GRID_PX))

    // Apply max constraints
    const targetW = config.maxWidth ? Math.min(neededW, config.maxWidth) : neededW
    const targetH = config.maxHeight ? Math.min(neededH, config.maxHeight) : neededH

    // Grow only — don't shrink
    const newW = Math.max(placement.width, targetW)
    const newH = Math.max(placement.height, targetH)

    if (newW === placement.width && newH === placement.height) return

    // Check collision before growing
    const candidate: Placement = { x: placement.x, y: placement.y, width: newW, height: newH }
    const others = allPlacements.filter((p) => p.id !== componentId)
    if (checkCollision(candidate, others, GUTTER).collides) return // Blocked by neighbor

    onUpdate(componentId, candidate)
  }, [componentId, placement, config, allPlacements, onUpdate])

  useEffect(() => {
    if (!config.enabled || !contentRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect

      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        if (!hasInitialized.current) {
          // First render: set initial size
          hasInitialized.current = true
          tryGrow(width, height)
        } else {
          // Subsequent: grow only
          tryGrow(width, height)
        }
      }, DEBOUNCE_MS)
    })

    observer.observe(contentRef.current)
    return () => {
      observer.disconnect()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [config.enabled, tryGrow])

  return { contentRef }
}
```

- [ ] **Step 2: Integrate into CanvasItem**

In `src/renderer/canvas/components/CanvasItem.tsx`, add the import:

```typescript
import { useAutoSize } from '../hooks/useAutoSize'
```

Add the hook call inside the CanvasItem component (after the resize hook):

```typescript
  const autoSize = useAutoSize(
    component.componentId,
    activePlacement,
    {
      enabled: layout?.autoSize !== false,
      minWidth: layout?.minWidth ?? 10,
      minHeight: layout?.minHeight ?? 6,
      maxWidth: layout?.maxWidth,
      maxHeight: layout?.maxHeight,
    },
    allPlacements,
    onUpdatePlacement,
  )
```

Wrap the DynamicComponent in the measurement ref:

```typescript
      {/* Component content */}
      <div ref={autoSize.contentRef} className="w-full" style={{ height: `calc(100% - 24px)` }}>
        <DynamicComponent bundle={component.bundle} />
      </div>
```

- [ ] **Step 3: Run typecheck + tests**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npm run typecheck && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/canvas/hooks/useAutoSize.ts src/renderer/canvas/components/CanvasItem.tsx
git commit -m "feat(canvas): add content-aware auto-sizing with grow-only ResizeObserver"
```

---

## Task 9: Update Agent Prompts (layout field)

Update the LLM prompt fragments so the agent generates `layout` instead of just `defaultSize`.

**Files:**
- Modify: `src/main/agent/prompts/fragments.ts:107-136`

- [ ] **Step 1: Update manifest format in prompt fragment**

In `src/main/agent/prompts/fragments.ts`, replace the `### Grid System` section and `### Manifest Format` section (lines 107-136) with:

```typescript
### Grid System
- Base unit: 8px
- All component dimensions are in grid units (multiply by 8 for pixels)
- Typical sizes: small widget = 20×15, medium card = 30×25, large panel = 50×40

### Manifest Format (required fields)
\`\`\`json
{
  "name": "Human Readable Name",
  "description": "What this component does in 1-2 sentences",
  "tags": ["category", "keywords"],
  "inputs": {
    "propName": { "type": "string", "description": "...", "required": true, "stateKey": "comp.key" }
  },
  "outputs": {
    "valueName": { "type": "number", "description": "...", "stateKey": "comp.outputKey" }
  },
  "events": {
    "onItemSelected": { "description": "...", "payload": { "id": { "type": "string", "description": "..." } } }
  },
  "actions": {
    "refresh": { "description": "...", "params": {} }
  },
  "files": [
    { "path": "ui.tsx", "type": "ui", "role": "main render" },
    { "path": "logic.ts", "type": "logic", "role": "data hooks" }
  ],
  "defaultSize": { "width": 30, "height": 25 },
  "layout": {
    "minWidth": 15,
    "minHeight": 10,
    "maxWidth": 60,
    "maxHeight": 50,
    "autoSize": true,
    "breakpoints": [
      { "name": "compact", "width": 20, "height": 15 },
      { "name": "full", "width": 40, "height": 30 }
    ]
  }
}
\`\`\`

**Layout guidelines:**
- \`defaultSize\` is the initial size. \`layout\` provides resize constraints.
- \`minWidth\`/\`minHeight\`: smallest the component can be resized to (required)
- \`maxWidth\`/\`maxHeight\`: largest allowed (optional, omit for uncapped)
- \`autoSize: true\` (default): canvas measures DOM and adjusts size automatically
- \`breakpoints\`: optional responsive sizes the component is designed for. Name them descriptively ("compact", "medium", "full"). Order small to large.
- Simple widgets (clock, button): skip breakpoints, set tight min/max
- Complex dashboards: declare 2-3 breakpoints matching your responsive CSS
```

- [ ] **Step 2: Run prompt-related tests**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/main/agent/__tests__/orchestrator-prompts.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/prompts/fragments.ts
git commit -m "feat(agent): update manifest prompt to include layout constraints and breakpoints"
```

---

## Task 10: Final Integration + Full Test Pass

Ensure everything works together — typecheck, all tests, no regressions.

**Files:**
- No new files — verification only

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npm run typecheck`
Expected: PASS with no errors

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Verify IPC channel registration test passes**

The existing test at `src/main/agent/__tests__/ipc-channels.test.ts` may check channel lists. Verify `canvas:update-placement` doesn't cause a failure.

Run: `cd /Users/tomerast/Projects/CSlate/.worktrees/component-rendering && npx vitest run src/main/agent/__tests__/ipc-channels.test.ts`
Expected: PASS

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A && git commit -m "fix: integration fixups for component rendering engine"
```

(Only run if there were fixes needed in steps 1-3.)
