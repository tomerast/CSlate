# Progressive Canvas Rendering

**Date:** 2026-03-31
**Status:** Draft
**Goal:** Give users a rich, informative, visual build experience on the canvas — from the first moment a request is submitted through to the final rendered component.

---

## Problem

Today the canvas shows nothing until `renderComponent` finishes with a complete bundle. During the 10-30 second build, the only feedback is a small status label in the chat bar. Users have no sense of what's happening, what's being built, or how far along things are. The experience feels dead while the agent works.

## Solution

A **BuildingCard** canvas item that appears instantly when a build starts, occupies the expected grid slot, and progresses through animated phases — showing the component name, file-by-file build progress, and partial renders when possible. Users can continue chatting while the card builds; new messages queue and fire after the current build completes.

---

## Architecture

### New Canvas State

`canvasStore` gains a `buildingCards` array alongside the existing `components` and `preview`:

```typescript
interface BuildingCard {
  buildId: string
  phase: BuildPhase
  componentName?: string        // populated after plan
  description?: string          // populated after plan
  tasks: BuildingTask[]         // populated after plan
  partialBundle?: string        // populated after ui.tsx worker completes
  partialSource?: string        // fallback if bundle fails
  placement: Placement          // estimated initially, updated from plan
}

interface BuildingTask {
  file: string                  // e.g. "ui.tsx", "hooks/useWeather.ts"
  assignment: string            // human-readable: "Main view with city search"
  status: 'pending' | 'building' | 'done'
}

type BuildPhase = 'think' | 'plan' | 'build' | 'test' | 'done'
```

Actions: `addBuildingCard`, `updateBuildingCard`, `removeBuildingCard`.

The card is removed when `writeComponent` succeeds; the real component takes its slot at the same coordinates.

### New IPC Events

Three new events emitted by the orchestrator (added to `channels.ts` listen list):

| Event | When | Payload |
|-------|------|---------|
| `agent:build:start` | Orchestrator begins | `{ buildId }` |
| `agent:build:plan` | `planComponent` tool resolves | `{ buildId, componentId, description, tasks: { file, assignment }[], placement }` |
| `agent:build:partial` | `ui.tsx` worker completes | `{ buildId, bundle?, source?, error? }` |

The existing `agent:orchestrator:status` events continue to fire and are used to advance the phase.

### Phase Mapping

The orchestrator emits fine-grained phases (understand, search, plan, dispatch, worker, validate, fix, ship). The BuildingCard maps these to five user-facing steps:

| Orchestrator Phase | Card Phase | Phase Strip Label |
|-------------------|------------|-------------------|
| understand, search | think | Think |
| plan | plan | Plan |
| dispatch, worker | build | Build |
| validate, fix | test | Test |
| ship | done | Done |

### Partial Rendering

When a worker completes `ui.tsx`, the main process attempts a "loose bundle" using esbuild:
- Missing local imports (hooks, types) are treated as externals and stubbed with empty objects
- `react` and `react-dom` remain externalized as usual
- If the bundle evaluates and renders without throwing: emit `bundle` in `agent:build:partial`
- If it throws: emit `source` (the raw file content) as fallback

The renderer tries to render the bundle in a sandboxed area inside the BuildingCard. If it fails at render time, it falls back to displaying the source in a mini code block.

### Queue System

`chatStore` gains:

```typescript
messageQueue: string[]
isBuilding: boolean
```

- When user submits while `isBuilding === true`: message is pushed to `messageQueue`
- A subtle badge appears in the command bar: "1 queued", "2 queued"
- When `agent:done` fires: if queue is non-empty, dequeue first message and auto-submit
- Queue is renderer-side only; no orchestrator changes needed

---

## UI Components

All new components live in `src/renderer/canvas/building/`.

### BuildingCard.tsx

Top-level card rendered by `SlateCanvas` when `canvasStore.buildingCards` is non-empty. Layout:

```
┌─────────────────────────────────────┐
│  ● ● ● ○ ○   Think → Done          │  ← PhaseStrip
│                                     │
│  "Pulling together the forecast     │  ← PhraseRotator (large text)
│   logic..."                         │
│                                     │
│  ✓ ui.tsx — Main view with search   │  ← TaskRow (done)
│  ⟳ hooks/useWeather.ts — Fetching   │  ← TaskRow (building)
│  ○ types.ts — Type definitions      │  ← TaskRow (pending)
│                                     │
│  ┌─────────────────────────────┐    │
│  │   [partial render of ui.tsx] │    │  ← PartialPreview (when available)
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

The card's height is animated (spring transition) — it starts compact (just PhaseStrip + phrase), grows when task rows appear, grows again when partial render is ready, and contracts during `test` phase (rows collapse to a summary line like "3 files assembled").

### PhaseStrip.tsx

Five dots with labels. Active dot pulses (CSS animation). Completed dots are filled. Upcoming dots are hollow. Compact, always visible at the top.

### PhraseRotator.tsx

Displays a single phrase at a time. Picks randomly from the current phase's pool on mount and re-picks every 4 seconds (crossfade animation). Accepts template context (`componentName`, `file`, `task`) to fill parameterized phrases.

### TaskRow.tsx

One row per file from the plan. Three states:
- **pending**: muted dot + muted text
- **building**: animated spinner + active phrase + filename in secondary text
- **done**: checkmark + completion phrase + filename

Rows enter with a staggered slide-in animation as they appear.

### PartialPreview.tsx

Wraps `DynamicComponent` (existing sandbox evaluator) in a constrained container inside the card. If the partial bundle renders, shows the live component. If it throws, shows a mini syntax-highlighted code block (first ~25 lines of `ui.tsx`).

### Transition to Real Component

When `writeComponent` tool-result arrives:
1. The BuildingCard crossfades out (opacity + slight scale down)
2. The real `CanvasItem` fades in at the same grid coordinates
3. `removeBuildingCard(buildId)` is called after the exit animation completes

### phrases.ts

Phrase pools organized by phase. Each pool has ~10 entries. Some are plain strings, some are templates:

```typescript
const phrasePools: Record<BuildPhase, string[]> = {
  think: [
    "Let me think about this...",
    "Getting a feel for what you need...",
    "Thinking through the approach...",
    "Considering a few angles...",
    "Figuring out the best way to build this...",
    "On it...",
    "Let's see what makes sense here...",
    "Mulling this over...",
    "Looking at what we've built before...",
    "Checking for similar work...",
  ],
  plan: [
    "Sketching out {componentName}...",
    "Planning the structure...",
    "Mapping out the pieces...",
    "Deciding how to organize this...",
    "Laying the groundwork...",
    "Working out the details...",
    "Got a plan forming...",
    "Breaking this down...",
    "Figuring out the right files...",
    "Shaping {componentName}...",
  ],
  build: [
    "Writing {file}...",
    "Wiring up {task}...",
    "Putting {file} together...",
    "Working on {task}...",
    "Building out {file}...",
    "Getting {file} ready...",
    "Crafting the {task}...",
    "Coding {file}...",
    "Almost done with {file}...",
    "Finishing up {file}...",
  ],
  test: [
    "Putting it all together...",
    "Seeing if it runs...",
    "Checking everything fits...",
    "Assembling the pieces...",
    "Running a quick test...",
    "Making sure it works...",
    "Trying it out...",
    "One last check...",
    "Validating the build...",
    "Wrapping things up...",
  ],
  done: [
    "All set!",
    "Here you go!",
    "Ready for you.",
    "Done!",
    "Built and ready.",
  ],
}
```

Phrases are picked randomly. During `build` phase, the active worker's `file` and `task` fill the templates. If no template context is available, plain strings are used.

---

## Data Flow (end-to-end)

```
User submits "Make a weather widget"
  │
  ├─ useChat sends agent:run
  │
  ├─ Orchestrator starts
  │   ├─ emit agent:build:start { buildId: "abc" }
  │   │   └─ Renderer: canvasStore.addBuildingCard({ buildId: "abc", phase: "think" })
  │   │       └─ Canvas shows compact BuildingCard with pulsing phrase
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "understand" }
  │   ├─ emit agent:orchestrator:status { phase: "search" }
  │   │   └─ Renderer: card phrase rotates, still "think" phase
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "plan" }
  │   │   └─ Renderer: card transitions to "plan" phase
  │   │
  │   ├─ emit agent:build:plan { buildId: "abc", componentId: "weather_widget",
  │   │     description: "Weather widget with city search and 5-day forecast",
  │   │     tasks: [{ file: "ui.tsx", assignment: "Main view with search" }, ...],
  │   │     placement: { x: 0, y: 0, width: 400, height: 300 } }
  │   │   └─ Renderer: card expands — shows component name, task rows appear
  │   │       Card animates to planned placement if different from initial
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "dispatch", workerCount: 3 }
  │   │   └─ Renderer: card transitions to "build" phase
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "worker", file: "ui.tsx", status: "building" }
  │   │   └─ Renderer: TaskRow for ui.tsx becomes active (spinner)
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "worker", file: "ui.tsx", status: "done" }
  │   │   └─ Renderer: TaskRow checkmark
  │   │
  │   ├─ emit agent:build:partial { buildId: "abc", bundle: "..." }
  │   │   └─ Renderer: PartialPreview area expands, renders ui.tsx live
  │   │
  │   ├─ (other workers complete similarly)
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "validate" }
  │   │   └─ Renderer: card contracts — task rows collapse to summary, "test" phase
  │   │
  │   ├─ emit agent:orchestrator:status { phase: "ship" }
  │   │   └─ Renderer: card phase reaches "done", celebration phrase
  │   │
  │   └─ renderComponent tool-result → writeComponent tool-result
  │       └─ Renderer: BuildingCard crossfades out, real CanvasItem fades in
  │
  └─ agent:done
      └─ If messageQueue non-empty: auto-submit next message
```

---

## Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `src/renderer/canvas/building/BuildingCard.tsx` | Main card component |
| `src/renderer/canvas/building/PhaseStrip.tsx` | Phase progress dots |
| `src/renderer/canvas/building/PhraseRotator.tsx` | Rotating phrase display |
| `src/renderer/canvas/building/TaskRow.tsx` | Per-file build row |
| `src/renderer/canvas/building/PartialPreview.tsx` | Sandbox partial render or code fallback |
| `src/renderer/canvas/building/phrases.ts` | Phrase pools per phase |
| `src/renderer/canvas/building/types.ts` | BuildingCard, BuildingTask, BuildPhase types |

### Modified Files
| File | Change |
|------|--------|
| `src/renderer/store/canvasStore.ts` | Add `buildingCards` state + actions |
| `src/renderer/store/chatStore.ts` | Add `messageQueue`, `isBuilding` |
| `src/renderer/canvas/SlateCanvas.tsx` | Render BuildingCards from store |
| `src/renderer/chat/useChat.ts` | Listen to new IPC events, queue logic |
| `src/preload/channels.ts` | Add new listen channels |
| `src/main/agent/orchestrator/index.ts` | Emit `agent:build:start`, `agent:build:plan`, `agent:build:partial` |
| `src/main/agent/tools/renderComponent.ts` | Add loose-bundle helper for partial rendering |

---

## Error Handling

- **Partial bundle fails to build**: Emit `agent:build:partial` with `source` instead of `bundle`. Card shows code block.
- **Partial bundle renders but throws at runtime**: `PartialPreview` ErrorBoundary catches it, shows code fallback.
- **Full build fails (validate phase)**: Card shows "test" phase with failure indicator, orchestrator enters fix loop, card stays visible during retry.
- **Agent errors out entirely**: Card shows error state with the error message, then fades out after a few seconds.
- **User sends message while building**: Queued. Badge shows count. Auto-submitted after current build.

---

## Out of Scope (for this iteration)

- **Plan injection / amendment**: User messages during early phases redirecting the plan (Approach B from brainstorm). Natural follow-up once the card UX is proven.
- **Streaming code preview**: Token-by-token code display as files are generated (Approach C). Unnecessary complexity now.
- **Multiple concurrent BuildingCards**: Only one active build at a time. Queue handles serialization.
- **Drag/resize of BuildingCard**: Uses the placement from the plan. Not user-interactive during build.
