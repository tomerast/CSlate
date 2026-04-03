# Component Rendering Engine Design

**Date:** 2026-04-03
**Branch:** feature/component-rendering
**Approach:** Hybrid — `@dnd-kit` for drag, custom resize, custom intelligence

## Overview

Redesign the CSlate canvas rendering engine to support dynamic auto-sizing, semantic smart placement, interactive drag with snap guides, and constraint-aware resize with breakpoint detents. No overlaps are ever permitted.

## Requirements

1. **Content-aware auto-sizing** — measure DOM on first render, snap to best size. LLM hints as starting point.
2. **Grow-only auto-resize** — after first render, components grow if content demands; never auto-shrink.
3. **Semantic smart placement** — agent places related components near each other based on tag/description affinity.
4. **Interactive drag** — free movement with snap guides (edge/center alignment to neighbors). Grid-snapped (1 unit = 8px).
5. **No overlaps** — enforced on placement, drag, resize, and auto-grow. 2 grid-unit gutter between all components.
6. **Constraint-aware resize** — 8 handles (4 corners + 4 edges). Respects `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `preferredAspectRatio` from manifest.
7. **Breakpoint detents** — manifest can declare responsive breakpoints. Resize shows magnetic "detent" zones with labels. User can push through them.
8. **Growth blocked by neighbors** — no push/cascade. If growth would collide, it's clamped.

## Data Model

### Extended Placement (canvas.json + canvasStore)

```typescript
interface Placement {
  x: number       // grid units from left
  y: number       // grid units from top
  width: number   // width in grid units
  height: number  // height in grid units
  zIndex?: number // rendering order (selection/guides, not overlap)
}
```

### Manifest `layout` field (replaces `defaultSize`)

```typescript
interface ComponentLayout {
  minWidth: number              // grid units (default: 10)
  minHeight: number             // grid units (default: 6)
  maxWidth?: number             // grid units (optional cap)
  maxHeight?: number            // grid units (optional cap)
  preferredAspectRatio?: number // e.g. 1.5 = 3:2
  breakpoints?: Breakpoint[]    // ordered small -> large
  autoSize: boolean             // default true
}

interface Breakpoint {
  name: string    // e.g. "compact", "medium", "full"
  width: number   // grid units
  height: number  // grid units
}
```

**Migration:** Existing components without `layout` get defaults (`minWidth: 10`, `minHeight: 6`, `autoSize: true`) with `defaultSize.width/height` mapped as initial placement. No breaking change.

### canvasStore additions

- `updatePlacement(componentId: string, placement: Placement)` — updates in-memory + debounced IPC persist (500ms)

## Content-Aware Auto-Sizing

**Hook:** `useAutoSize` in `src/renderer/canvas/hooks/useAutoSize.ts`

### First render

1. Render component in a hidden measurement div (off-screen, `visibility: hidden`, unconstrained dimensions)
2. Measure natural content size via the DOM
3. Convert pixels to grid units (`Math.ceil(px / GRID_PX)`)
4. Clamp to manifest constraints (`minWidth`/`minHeight`/`maxWidth`/`maxHeight`)
5. If breakpoints declared, snap to nearest breakpoint that fits the content
6. Set initial placement

### Grow-only after mount

- `ResizeObserver` on component's content root
- If observed size exceeds current allocation: grow placement (clamped to max, blocked by neighbors)
- If observed size shrinks: no-op
- Debounced at 200ms

### LLM interaction

- `layout.autoSize: true` (default): measure DOM, adjust from LLM's starting point
- `layout.autoSize: false`: trust LLM's declared size entirely

## Smart Placement Solver

**Module:** `src/main/agent/lib/placementSolver.ts` (main process, called by `writeComponent`)

### Algorithm — 3 steps

**Step 1: Semantic affinity scoring**
- Compare new component's manifest (name, description, tags) against all existing components
- Score via tag overlap + keyword intersection in descriptions
- Identify **anchor component** (highest affinity score)

**Step 2: Candidate position generation**
- Generate 4 candidate positions around the anchor: right, below, left, above (preference order)
- Each offset from anchor's edge by 2 grid-unit gutter
- No anchor (first component or zero affinity): place at `(2, 2)`

**Step 3: Collision-free selection**
- Test each candidate via AABB intersection against all existing placements (with gutter)
- Pick first non-colliding candidate
- If all 4 blocked: try second ring (same directions around next-highest-affinity component)
- Last resort: scan for largest empty rectangle on canvas

**Override:** Agent can still pass explicit `placement` to `writeComponent`.

## Drag System

**Library:** `@dnd-kit/core`
**Hook:** `useDragCanvas` in `src/renderer/canvas/hooks/useDragCanvas.ts`

### Flow

1. Mousedown on component's drag handle (top bar of `CanvasItem`)
2. `@dnd-kit` `onDragStart` — component enters dragging visual state
3. `onDragMove` — compute tentative `(x, y)` in grid units:
   - **Snap guides:** compare edges/centers against all other components. Within 1 grid-unit threshold: snap + render guide line
   - **Collision check:** AABB test against all others. If overlap: clamp position to nearest non-overlapping spot along drag vector (stops at neighbor's edge)
4. `onDragEnd` — commit to `canvasStore.updatePlacement()` → debounced persist

### Snap guides

- Calculated by `useSnapGuides` hook
- Returns `{ axis: 'x' | 'y', position: number }[]` for active alignments
- Rendered by `SnapGuideOverlay` — subtle blue lines, visible only during drag/resize

### Canvas auto-scroll

- `@dnd-kit` `AutoScrollActivator` handles scrolling when dragging near canvas edges

## Resize System

**Custom implementation** — no library.
**Hook:** `useResize` in `src/renderer/canvas/hooks/useResize.ts`

### Handles

- 8 per selected component: `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`
- Rendered by `ResizeHandle` component, visible on hover/selection

### Flow

1. Mousedown on handle — capture pointer, store initial placement + mouse position
2. Pointermove — compute delta in grid units based on handle direction:
   - Corner handles: adjust both width + height
   - Edge handles: adjust one axis
3. **Constraint clamping:** enforce `minWidth`, `minHeight`, `maxWidth`, `maxHeight`
4. **Aspect ratio:** if `preferredAspectRatio` set + corner handle: maintain ratio. Edge handles are free-form.
5. **Breakpoint detents:** if manifest has `breakpoints`, within 2 grid units of a breakpoint: magnetic pull. Show breakpoint name label. User can push through.
6. **Collision check:** if new size overlaps neighbor: clamp to neighbor's edge minus gutter
7. Pointerup — commit to `canvasStore.updatePlacement()` → persist

### Direction-aware origin

- Dragging `nw`: bottom-right is anchored
- Dragging `e`: left side is anchored
- Top/left handles adjust both position (x, y) and size

### Visual feedback

- Ghost outline of tentative size
- Dimension label (e.g. "50 x 32") near active handle
- Breakpoint name when near a detent
- Snap guides active during resize

## Collision System

**Module:** `src/renderer/canvas/lib/collision.ts` (renderer — used by drag, resize, auto-size hooks)
**Mirrored in:** `src/main/agent/lib/collision.ts` (main process — used by PlacementSolver)

Pure functions, same logic in both processes. Shared via copy (no cross-process import possible in Electron).

### Core

```typescript
checkCollision(
  candidate: Placement,
  allPlacements: Placement[],
  exclude?: string
): { collides: boolean; collidingIds: string[] }
```

AABB intersection with 2 grid-unit gutter on all sides.

### Helpers

- `clampToNonOverlapping(candidate, allPlacements, dragVector)` — walks back along drag vector until no collision
- `clampResize(candidate, allPlacements, anchor, direction)` — shrinks resize delta until no collision
- `findEmptyRect(allPlacements, minWidth, minHeight)` — scans canvas for largest fitting gap

### Performance

Brute-force AABB against all components on every pointer move. Sub-millisecond for <100 components. Spatial hash deferred until needed.

## File Map

### New files

```
src/renderer/canvas/
  hooks/
    useDragCanvas.ts         @dnd-kit setup, snap + collision on drag
    useResize.ts             pointer-event resize with constraints + detents
    useAutoSize.ts           ResizeObserver + grow-only
    useSnapGuides.ts         edge/center alignment calculation
  lib/
    collision.ts             AABB checks, clamp helpers
  components/
    CanvasItem.tsx            drag handle, resize handles, selection state
    ResizeHandle.tsx          individual handle component
    SnapGuideOverlay.tsx      alignment lines during drag/resize

src/main/agent/lib/
  placementSolver.ts         semantic affinity + candidate generation
  collision.ts               AABB checks (mirrored from renderer)
```

### Modified files

| File | Change |
|------|--------|
| `src/renderer/canvas/SlateCanvas.tsx` | Wrap in `DndContext`, render `SnapGuideOverlay`, use `CanvasItem` instead of inline divs |
| `src/renderer/store/canvasStore.ts` | Add `updatePlacement()` method |
| `src/main/agent/tools/writeComponent.ts` | Call `PlacementSolver` instead of vertical stacking |
| `src/main/agent/prompts/fragments.ts` | Update manifest instructions: `layout` field instead of `defaultSize` |
| `src/preload/channels.ts` | Add `canvas:update-placement` channel |
| `src/main/ipc/project.ts` | Add `canvas:update-placement` handler |
| `src/shared/blueprintTypes.ts` | Add `ComponentLayout` and `Breakpoint` types |

### Dependencies

- `@dnd-kit/core` — drag infrastructure (~15KB)
- `@dnd-kit/utilities` — transform helpers

## Non-Goals

- Push/cascade behavior (components don't push others when growing)
- Overlap/z-order stacking (components never overlap)
- Spatial indexing (not needed at current scale)
- Touch/mobile support (Electron desktop app)
- Undo/redo for placement changes (future work)
