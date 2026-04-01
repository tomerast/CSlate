# Component Boilerplate Template — Design Spec
_2026-04-01_

## Problem

CSlate sub-agents currently generate all component files from scratch when no community blueprint is found. The only guidance is the `PLATFORM_KNOWLEDGE` prompt fragment. This leads to inconsistent structure, missing loading/error states, loose TypeScript, and variable hook organization across builds.

## Goal

Add a `COMPONENT_TEMPLATE` to `@cslate/shared` — a set of starter file contents that sub-agents receive as a "starting point to adapt" instead of a blank slate. Patterns are drawn from two boilerplates and adapted for CSlate's sandbox constraints.

## Source Boilerplates

- **[thecodingmachine/react-native-boilerplate](https://github.com/thecodingmachine/react-native-boilerplate)**: component structure, `Properties` typing convention, `readonly` props, hook-as-namespace pattern, explicit loading/error state, `Optional<T, K>` utility, Zod-first type derivation.
- **[jsynowiec/node-typescript-boilerplate](https://github.com/jsynowiec/node-typescript-boilerplate)**: strict TypeScript flags (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`), `const enum` for keyed constants, JSDoc conventions.

---

## Architecture

### 1. `@cslate/shared` — new `src/templates/component.ts`

Exports a single constant:

```typescript
export const COMPONENT_TEMPLATE: Record<string, string> = {
  'ui.tsx': '...',
  'logic.ts': '...',
  'types.ts': '...',
  'manifest.json': '...',
  'context.md': '...',
}
```

Re-exported from `src/index.ts`.

Also adds `Optional<T, K>` to `src/types/index.ts`:

```typescript
export type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>
```

### 2. `CSlate` — `src/main/agent/orchestrator/sub-agent.ts`

`buildSubAgentPrompt` currently sends `"No blueprint available — build from scratch"` when `task.blueprint` is null. Updated to inject the matching template file as a `STARTING POINT` section:

```typescript
import { COMPONENT_TEMPLATE } from '@cslate/shared'

const fallback = COMPONENT_TEMPLATE[task.file]
const blueprintSection = task.blueprint
  ? `\n## BLUEPRINT — ADAPT this code to match the assignment:\n\`\`\`\n${task.blueprint}\n\`\`\``
  : fallback
    ? `\n## STARTING POINT — ADAPT this template to the assignment:\n\`\`\`\n${fallback}\n\`\`\``
    : '\n## No template available — build from scratch.'
```

No changes to `orchestrator/index.ts`, tool schemas, or phase logic.

---

## Template File Contents

### `types.ts`

- `Properties` type (named `Properties`, not `Props`) with all fields `readonly`
- `BridgeApi` and `StoreApi` typed inline (sub-agent replaces with specific methods needed)
- `Optional<T, K>` imported from `@cslate/shared` for components that spread base props

```typescript
import type { Optional } from '@cslate/shared'

type BridgeApi = {
  readonly fetch: (sourceId: string, endpointId: string, params?: Record<string, unknown>) => Promise<unknown>
  readonly subscribe: (sourceId: string, endpointId: string, params: Record<string, unknown>, callback: (data: unknown) => void) => () => void
  readonly getConfig: (key: string) => string | undefined
}

type StoreApi = {
  readonly get: (key: string) => unknown
  readonly set: (key: string, value: unknown) => void
}

export type Properties = {
  readonly bridge: BridgeApi
  readonly store: StoreApi
}
```

### `logic.ts`

- Hook-as-namespace pattern: returns a typed state object (not raw `useState` tuple)
- Explicit `DataState` type with `readonly` fields — no inline `any`
- `useEffect` stub with bridge.fetch placeholder
- Functions that don't depend on render state hoisted outside the hook body

```typescript
import { useState, useEffect } from 'react'
import type { Properties } from './types'

type DataState = {
  readonly data: unknown | null
  readonly loading: boolean
  readonly error: string | null
}

export function useComponentData(bridge: Properties['bridge']): DataState {
  const [state, setState] = useState<DataState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    // TODO: replace with bridge.fetch('sourceId', 'endpointId', {})
    setState(prev => ({ ...prev, loading: false }))
  }, [])

  return state
}
```

### `ui.tsx`

- Default export function (not `const` arrow), named `Component` (sub-agent renames)
- Destructured `Properties` — no inline prop type
- Explicit loading branch → error branch → happy path (two-layer pattern from RN boilerplate)
- Design token classes only — no hardcoded colors

```tsx
import React from 'react'
import type { Properties } from './types'
import { useComponentData } from './logic'

export default function Component({ bridge, store }: Properties) {
  const { data, loading, error } = useComponentData(bridge)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-muted text-sm">Loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-error text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="h-full bg-background p-4">
      {/* TODO: render data */}
    </div>
  )
}
```

### `manifest.json`

Minimal valid stub with all required top-level keys and a `files` array pre-populated for the three-file structure. Sub-agent removes entries for files it does not produce (e.g. a simple component may omit `logic.ts` and `types.ts`):

```json
{
  "name": "Component Name",
  "description": "What this component does.",
  "tags": [],
  "inputs": {},
  "outputs": {},
  "events": {},
  "actions": {},
  "files": [
    { "path": "ui.tsx", "type": "ui", "role": "main render" },
    { "path": "logic.ts", "type": "logic", "role": "data hooks" },
    { "path": "types.ts", "type": "types", "role": "shared interfaces" }
  ],
  "defaultSize": { "width": 30, "height": 25 }
}
```

### `context.md`

```markdown
<!-- Replace this with 2-4 sentences: what was built and why. -->
```

---

## Data Flow

```
orchestrator plans tasks
  → no community blueprint found
  → dispatchSubAgents passes blueprint: null for each task
    → buildSubAgentPrompt checks COMPONENT_TEMPLATE[task.file]
      → found: injects as STARTING POINT section
      → not found: "build from scratch"
```

---

## What Is Not Changing

- Orchestrator phase logic (`prepareStep`, `planComponent`, `dispatchSubAgents`, etc.)
- The `blueprint` field on task schema — still nullable, community blueprints still take priority
- `PLATFORM_KNOWLEDGE` fragment — the template supplements it, not replaces it
- `validateManifest`, `renderComponent`, `writeComponent` — unchanged

---

## Research Refinements (vs Initial Design)

The initial spec used a `{ data, loading, error }` flat object for `DataState`. Research (bulletproof-react, react.dev 2024) showed that a **discriminated union** is superior:

```typescript
// Initial spec — allows impossible states (loading: true, data: {...})
type DataState = { readonly data: unknown | null; readonly loading: boolean; readonly error: string | null }

// Implemented — impossible states unrepresentable; TypeScript narrows per branch
type DataState<T = unknown> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: string }
```

Other refinements applied:
- Pure transform functions hoisted to module scope (not inside `useCallback`) — from react-native-boilerplate
- `role="alert"` on error states — from bulletproof-react accessibility conventions
- Structured `context.md` with five labelled sections — enables orchestrator to parse component history

---

## Files Changed

| Repo | File | Change |
|------|------|--------|
| `CSlate-shared` | `src/templates/component.ts` | New — exports `COMPONENT_TEMPLATE` |
| `CSlate-shared` | `src/types/index.ts` | Add `Optional<T, K>` utility type |
| `CSlate-shared` | `src/index.ts` | Re-export from `./templates/component` |
| `CSlate` | `src/main/agent/orchestrator/sub-agent.ts` | Import + use `COMPONENT_TEMPLATE` in `buildSubAgentPrompt` |

---

## Testing

- Unit test in `CSlate-shared`: `src/templates/__tests__/component.test.ts` — assert all five keys present, `ui.tsx` contains a default export, `manifest.json` parses as valid JSON with required fields
- Unit test in `CSlate`: `src/main/agent/__tests__/sub-agent.test.ts` — assert `buildSubAgentPrompt` includes `STARTING POINT` section when `blueprint` is null and template exists; falls back to "No template available" for unknown file names
