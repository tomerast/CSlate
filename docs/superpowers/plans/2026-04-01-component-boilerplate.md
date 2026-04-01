# Component Boilerplate Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `COMPONENT_TEMPLATE` to `@cslate/shared` with boilerplate for `ui.tsx`, `logic.ts`, `types.ts`, `manifest.json`, and `context.md` — drawn from bulletproof-react, react-native-boilerplate, and react.dev 2024 best practices — and inject them into sub-agents as a starting point when no community blueprint exists.

**Architecture:** `@cslate/shared` gains `src/templates/component.ts` exporting `COMPONENT_TEMPLATE: Record<string, string>`. The template uses a discriminated union `DataState<T>` (not three separate booleans), hoisted pure helpers, three-branch guard in `ui.tsx`, and structured `context.md`. CSlate's `buildSubAgentPrompt` injects the matching template as a `STARTING POINT` section when `task.blueprint` is null. A new `Optional<T, K>` utility type is also added to `@cslate/shared`.

**Tech Stack:** TypeScript, Vitest (both repos), tsup (CSlate-shared build), `file:` protocol for local dev linking between repos.

---

### Task 0: Set up branches and local dev link

**Files:**
- `~/Projects/CSlate-shared` — create feature branch
- `~/Projects/CSlate/package.json` — temporarily point `@cslate/shared` to local path

- [ ] **Step 1: Create feature branch in CSlate-shared**

```bash
cd ~/Projects/CSlate-shared
git checkout -b feature/component-boilerplate
```

Expected: `Switched to a new branch 'feature/component-boilerplate'`

- [ ] **Step 2: Create worktree for CSlate**

```bash
cd ~/Projects/CSlate
git worktree add ../CSlate-feature-component-boilerplate -b feature/component-boilerplate
```

Expected: `Preparing worktree (new branch 'feature/component-boilerplate')`

All CSlate changes in this plan happen inside `~/Projects/CSlate-feature-component-boilerplate/`.

- [ ] **Step 3: Point CSlate worktree at local CSlate-shared**

In `~/Projects/CSlate-feature-component-boilerplate/package.json`, change:
```json
"@cslate/shared": "github:tomerast/CSlate-shared",
```
to:
```json
"@cslate/shared": "file:../../CSlate-shared",
```

Then install:
```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm install
```

Expected: `added N packages` with no errors.

---

### Task 1: Add `Optional<T, K>` utility type to `@cslate/shared`

**Files:**
- Modify: `~/Projects/CSlate-shared/src/types/index.ts`

- [ ] **Step 1: Write the failing test**

Add to `~/Projects/CSlate-shared/src/schemas/manifest.test.ts` (at the bottom of the existing file):

```typescript
import type { Optional } from '../types'

describe('Optional<T, K> utility type', () => {
  it('compiles: makes specified keys optional without changing others', () => {
    type Base = { id: string; name: string; age: number }
    type WithOptionalName = Optional<Base, 'name'>

    const valid: WithOptionalName = { id: '1', age: 30 }        // name omitted — OK
    const also: WithOptionalName = { id: '2', name: 'Alice', age: 25 } // name present — OK
    expect(valid.id).toBe('1')
    expect(also.name).toBe('Alice')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Projects/CSlate-shared
npm test
```

Expected: FAIL — `Type 'Optional' does not exist`

- [ ] **Step 3: Add `Optional<T, K>` to types/index.ts**

In `~/Projects/CSlate-shared/src/types/index.ts`, add at the top before any imports:

```typescript
/** Makes specific keys K of type T optional while keeping all other keys required. */
export type Optional<T, K extends keyof T> = Omit<T, K> & Pick<Partial<T>, K>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/CSlate-shared
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/CSlate-shared
git add src/types/index.ts src/schemas/manifest.test.ts
git commit -m "feat: add Optional<T, K> utility type to @cslate/shared"
```

---

### Task 2: Create `COMPONENT_TEMPLATE` in `@cslate/shared`

**Files:**
- Create: `~/Projects/CSlate-shared/src/templates/component.ts`
- Create: `~/Projects/CSlate-shared/src/templates/__tests__/component.test.ts`
- Modify: `~/Projects/CSlate-shared/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `~/Projects/CSlate-shared/src/templates/__tests__/component.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { COMPONENT_TEMPLATE } from '../component'
import { ComponentManifestSchema } from '../../schemas/manifest'

describe('COMPONENT_TEMPLATE', () => {
  it('has entries for all five expected files', () => {
    expect(Object.keys(COMPONENT_TEMPLATE)).toEqual(
      expect.arrayContaining(['ui.tsx', 'logic.ts', 'types.ts', 'manifest.json', 'context.md'])
    )
  })

  it('ui.tsx has a default export', () => {
    expect(COMPONENT_TEMPLATE['ui.tsx']).toContain('export default function')
  })

  it('ui.tsx imports from ./types and ./logic', () => {
    expect(COMPONENT_TEMPLATE['ui.tsx']).toContain("from './types'")
    expect(COMPONENT_TEMPLATE['ui.tsx']).toContain("from './logic'")
  })

  it('ui.tsx has loading, error, and success branches', () => {
    const ui = COMPONENT_TEMPLATE['ui.tsx']
    expect(ui).toContain("status === 'loading'")
    expect(ui).toContain("status === 'error'")
    expect(ui).toContain("status === 'success'")
  })

  it('ui.tsx error state has role="alert" for accessibility', () => {
    expect(COMPONENT_TEMPLATE['ui.tsx']).toContain('role="alert"')
  })

  it('logic.ts exports useComponentData', () => {
    expect(COMPONENT_TEMPLATE['logic.ts']).toContain('export function useComponentData')
  })

  it('logic.ts uses discriminated union DataState (not separate loading/error booleans)', () => {
    const logic = COMPONENT_TEMPLATE['logic.ts']
    expect(logic).toContain("status: 'loading'")
    expect(logic).toContain("status: 'success'")
    expect(logic).toContain("status: 'error'")
    expect(logic).not.toContain('loading: true')
    expect(logic).not.toContain('loading: false')
  })

  it('types.ts exports DataState as a discriminated union', () => {
    const types = COMPONENT_TEMPLATE['types.ts']
    expect(types).toContain("export type DataState")
    expect(types).toContain("status: 'idle'")
    expect(types).toContain("status: 'loading'")
    expect(types).toContain("status: 'success'")
    expect(types).toContain("status: 'error'")
  })

  it('types.ts exports Properties with bridge and store', () => {
    const types = COMPONENT_TEMPLATE['types.ts']
    expect(types).toContain('export type Properties')
    expect(types).toContain('bridge: BridgeApi')
    expect(types).toContain('store: StoreApi')
  })

  it('manifest.json is valid JSON', () => {
    expect(() => JSON.parse(COMPONENT_TEMPLATE['manifest.json'])).not.toThrow()
  })

  it('manifest.json passes ComponentManifestSchema validation', () => {
    const manifest = JSON.parse(COMPONENT_TEMPLATE['manifest.json'])
    const result = ComponentManifestSchema.safeParse(manifest)
    expect(result.success).toBe(true)
  })

  it('manifest.json files array includes ui.tsx', () => {
    const manifest = JSON.parse(COMPONENT_TEMPLATE['manifest.json'])
    const filePaths = manifest.files.map((f: { path: string }) => f.path)
    expect(filePaths).toContain('ui.tsx')
  })

  it('context.md is a structured markdown template', () => {
    const ctx = COMPONENT_TEMPLATE['context.md']
    expect(ctx).toContain('## What was built')
    expect(ctx).toContain('## Why / user request')
    expect(ctx).toContain('## Data sources')
    expect(ctx).toContain('## Inter-component connections')
    expect(ctx).toContain('## Known limitations')
  })

  it('all template files are non-empty strings', () => {
    for (const [file, content] of Object.entries(COMPONENT_TEMPLATE)) {
      expect(typeof content, `${file} must be a string`).toBe('string')
      expect(content.trim().length, `${file} must not be empty`).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd ~/Projects/CSlate-shared
npm test
```

Expected: FAIL — `Cannot find module '../component'`

- [ ] **Step 3: Create the template file**

Create `~/Projects/CSlate-shared/src/templates/component.ts`:

```typescript
/**
 * Default component file templates.
 *
 * Patterns sourced from:
 * - bulletproof-react (discriminated union state, three-branch guard, keyof typeof variants)
 * - thecodingmachine/react-native-boilerplate (readonly Properties, hook-as-namespace, hoisted helpers)
 * - react.dev 2024 (function declarations, no React.FC, no return type annotation)
 * - jsynowiec/node-typescript-boilerplate (noImplicitReturns, noUnusedLocals strictness)
 *
 * Used by sub-agents as a STARTING POINT when no community blueprint is found.
 * Sub-agents adapt the content for the specific component they're building.
 */

const UI_TSX = `import React from 'react'
import type { Properties } from './types'
import { useComponentData } from './logic'

// TODO: rename Component to a descriptive PascalCase name matching the manifest name
export default function Component({ bridge, store }: Properties) {
  const state = useComponentData(bridge)

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="animate-pulse text-muted text-sm">Loading\u2026</div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-error text-sm" role="alert">{state.error}</p>
      </div>
    )
  }

  // state.status === 'success': TypeScript narrows here — state.data is available
  return (
    <div className="h-full bg-background p-4">
      {/* TODO: render state.data */}
    </div>
  )
}
`

const LOGIC_TS = `import { useState, useEffect, useCallback } from 'react'
import type { Properties, DataState } from './types'

// Hoisted pure helper — declared at module scope so it is not recreated on every render.
// TODO: replace with actual data transformation for this component's data shape.
function parseResponse(raw: unknown): unknown {
  return raw
}

export function useComponentData(bridge: Properties['bridge']): DataState {
  const [state, setState] = useState<DataState>({ status: 'idle' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    // TODO: replace 'sourceId' and 'endpointId' with the values declared in manifest.json dataSources.
    // TODO: replace the second argument to .then() with the actual data shape for this component.
    bridge
      .fetch('sourceId', 'endpointId', {})
      .then(raw => setState({ status: 'success', data: parseResponse(raw) }))
      .catch(err => setState({ status: 'error', error: err instanceof Error ? err.message : String(err) }))
  }, [bridge])

  useEffect(() => {
    load()
  }, [load])

  return state
}
`

const TYPES_TS = `// Component-specific types — rename and expand as needed.
// Ordering: primitive API types → domain types → component props (Properties last).

// External data channel — do not rename bridge or its methods; other components depend on this contract.
export type BridgeApi = {
  readonly fetch: (sourceId: string, endpointId: string, params?: Record<string, unknown>) => Promise<unknown>
  readonly subscribe: (
    sourceId: string,
    endpointId: string,
    params: Record<string, unknown>,
    callback: (data: unknown) => void,
  ) => () => void
  readonly getConfig: (key: string) => string | undefined
}

// Inter-component state channel — do not rename store or its methods.
export type StoreApi = {
  readonly get: (key: string) => unknown
  readonly set: (key: string, value: unknown) => void
}

// Discriminated union for async state — prevents impossible states (loading + data simultaneously).
// TypeScript narrows in each branch: inside status === 'success', data is guaranteed present.
// TODO: replace the \`unknown\` generic with the actual data type for this component.
export type DataState<T = unknown> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: string }

// Component props — always named Properties, all fields readonly.
// TODO: add component-specific props here (e.g. title, config values from manifest inputs).
export type Properties = {
  readonly bridge: BridgeApi
  readonly store: StoreApi
}
`

const MANIFEST_JSON = JSON.stringify(
  {
    name: 'Component Name',
    description: 'What this component does in 1-2 sentences.',
    tags: [],
    inputs: {},
    outputs: {},
    events: {},
    actions: {},
    files: [
      { path: 'ui.tsx', type: 'ui', role: 'main render' },
      { path: 'logic.ts', type: 'logic', role: 'data hooks' },
      { path: 'types.ts', type: 'types', role: 'shared interfaces' },
    ],
    defaultSize: { width: 30, height: 25 },
  },
  null,
  2,
)

const CONTEXT_MD = `## What was built
<!-- 1-2 sentences: component name and primary function -->

## Why / user request
<!-- What the user asked for that produced this component -->

## Data sources
<!-- bridge.fetch calls: sourceId, endpointId, expected data shape. Or "none" -->

## Inter-component connections
<!-- store keys read/written; events emitted/handled. Or "none" -->

## Known limitations
<!-- edge cases not handled, missing features. Or "none" -->
`

/**
 * Default starter file contents for a CSlate component package.
 *
 * Keys match the file paths used in a component package (e.g. "ui.tsx", "logic.ts").
 * Sub-agents receive these as a STARTING POINT when no community blueprint is found.
 * Files not present in this map are built from scratch.
 *
 * Note: manifest.json lists logic.ts and types.ts in its files array.
 * Sub-agents should remove those entries if they do not produce those files.
 */
export const COMPONENT_TEMPLATE: Record<string, string> = {
  'ui.tsx': UI_TSX,
  'logic.ts': LOGIC_TS,
  'types.ts': TYPES_TS,
  'manifest.json': MANIFEST_JSON,
  'context.md': CONTEXT_MD,
}
`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/Projects/CSlate-shared
npm test
```

Expected: all tests PASS including the new template tests.

- [ ] **Step 5: Re-export from index**

Add to the bottom of `~/Projects/CSlate-shared/src/index.ts`:

```typescript
export * from './templates/component'
```

- [ ] **Step 6: Build and typecheck**

```bash
cd ~/Projects/CSlate-shared
npm run build && npm run typecheck
```

Expected: `dist/` contains `index.js`, `index.cjs`, `index.d.ts`. No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/CSlate-shared
git add src/templates/ src/index.ts
git commit -m "feat: add COMPONENT_TEMPLATE boilerplate to @cslate/shared"
```

---

### Task 3: Update `buildSubAgentPrompt` in CSlate

**Files:**
- Modify: `~/Projects/CSlate-feature-component-boilerplate/src/main/agent/orchestrator/sub-agent.ts`
- Modify: `~/Projects/CSlate-feature-component-boilerplate/src/main/agent/__tests__/sub-agent.test.ts`

- [ ] **Step 1: Update the existing "build from scratch" test and add new cases**

Open `~/Projects/CSlate-feature-component-boilerplate/src/main/agent/__tests__/sub-agent.test.ts`.

Replace the existing test:
```typescript
it('says build from scratch when no blueprint', () => {
  const prompt = buildSubAgentPrompt({
    task: { file: 'logic.ts', assignment: 'Build data hooks', blueprint: null },
    contract: 'interface Props {}',
  })
  expect(prompt).toContain('from scratch')
})
```

With these three tests:
```typescript
it('injects STARTING POINT section for known template files when no blueprint', () => {
  for (const file of ['ui.tsx', 'logic.ts', 'types.ts', 'manifest.json', 'context.md']) {
    const prompt = buildSubAgentPrompt({
      task: { file, assignment: 'Build it', blueprint: null },
      contract: 'interface Props {}',
    })
    expect(prompt, `${file} should have STARTING POINT`).toContain('STARTING POINT')
    expect(prompt, `${file} should not say build from scratch`).not.toContain('No template available')
  }
})

it('says no template available for unknown file names when no blueprint', () => {
  const prompt = buildSubAgentPrompt({
    task: { file: 'custom-helper.ts', assignment: 'Build a helper', blueprint: null },
    contract: 'interface Props {}',
  })
  expect(prompt).toContain('No template available')
  expect(prompt).not.toContain('STARTING POINT')
})

it('community blueprint takes priority over template', () => {
  const prompt = buildSubAgentPrompt({
    task: {
      file: 'ui.tsx',
      assignment: 'Adapt card layout',
      blueprint: 'function Component() { return <div>blueprint</div> }',
    },
    contract: 'interface Props {}',
  })
  expect(prompt).toContain('BLUEPRINT')
  expect(prompt).toContain('blueprint')
  expect(prompt).not.toContain('STARTING POINT')
})
```

- [ ] **Step 2: Run to verify new tests fail, existing tests still pass**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm test -- src/main/agent/__tests__/sub-agent.test.ts
```

Expected: the three new tests FAIL, existing `buildSubAgentPrompt` tests still pass.

- [ ] **Step 3: Update `buildSubAgentPrompt` in sub-agent.ts**

Open `~/Projects/CSlate-feature-component-boilerplate/src/main/agent/orchestrator/sub-agent.ts`.

Add import at the top:
```typescript
import { COMPONENT_TEMPLATE } from '@cslate/shared'
```

Replace the existing `buildSubAgentPrompt` function body:

```typescript
export function buildSubAgentPrompt(params: {
  task: BuildTask
  contract: string
}): string {
  const { task, contract } = params

  const fallback = COMPONENT_TEMPLATE[task.file]
  const blueprintSection = task.blueprint
    ? `\n## BLUEPRINT — ADAPT this code to match the assignment:\n\`\`\`\n${task.blueprint}\n\`\`\``
    : fallback
      ? `\n## STARTING POINT — ADAPT this template to the assignment:\n\`\`\`\n${fallback}\n\`\`\``
      : '\n## No template available — build from scratch.'

  return `## CONTRACT (shared types — follow exactly):\n\`\`\`typescript\n${contract}\n\`\`\`\n${blueprintSection}\n\n## ASSIGNMENT:\nBuild file \`${task.file}\`: ${task.assignment}`
}
```

- [ ] **Step 4: Run all sub-agent tests to verify they pass**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm test -- src/main/agent/__tests__/sub-agent.test.ts
```

Expected: all tests PASS (including the previously-passing `includes blueprint when provided` and `includes contract and assignment` tests).

- [ ] **Step 5: Run the full test suite**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm test
```

Expected: all tests PASS. No TypeScript errors.

- [ ] **Step 6: Typecheck**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
git add src/main/agent/orchestrator/sub-agent.ts src/main/agent/__tests__/sub-agent.test.ts
git commit -m "feat: inject COMPONENT_TEMPLATE as sub-agent starting point when no blueprint"
```

---

### Task 4: Restore package.json and update the spec doc

**Files:**
- Modify: `~/Projects/CSlate-feature-component-boilerplate/package.json` — restore GitHub reference
- Modify: `~/Projects/CSlate/docs/superpowers/specs/2026-04-01-component-boilerplate-design.md` — update with research-informed refinements

Note: `package.json` in the worktree diverges from the main repo (it uses `file:`). Before merging, it must be restored to `github:tomerast/CSlate-shared` since the published package is what production uses.

- [ ] **Step 1: Restore package.json in the worktree**

In `~/Projects/CSlate-feature-component-boilerplate/package.json`, change back:
```json
"@cslate/shared": "file:../../CSlate-shared",
```
to:
```json
"@cslate/shared": "github:tomerast/CSlate-shared",
```

Do NOT run `npm install` — leave `node_modules` pointing at the local build for now.

- [ ] **Step 2: Update the design spec with research refinements**

Open `~/Projects/CSlate-feature-component-boilerplate/docs/superpowers/specs/2026-04-01-component-boilerplate-design.md`.

In the `logic.ts` template section, replace the `DataState` type with the discriminated union version and note the three key research findings:

After the `## What Is Not Changing` section, add:

```markdown
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
```

- [ ] **Step 3: Commit spec update**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
git add docs/superpowers/specs/2026-04-01-component-boilerplate-design.md
git commit -m "docs: update component boilerplate spec with discriminated union refinements"
```

---

### Task 5: Publish CSlate-shared and restore CSlate dependency

> **Note:** Publishing to npm requires credentials (`npm login` or an `NPM_TOKEN`). If you don't have publish access, skip the `npm publish` step and instead use `"file:../../CSlate-shared"` in the CSlate worktree for end-to-end testing, then coordinate with the package owner to publish before merging.

- [ ] **Step 1: Bump version in CSlate-shared**

In `~/Projects/CSlate-shared/package.json`, bump `"version"` from `"0.2.0"` to `"0.3.0"`.

- [ ] **Step 2: Publish to npm**

```bash
cd ~/Projects/CSlate-shared
npm run build && npm run typecheck && npm test
```

Expected: all pass. Then:

```bash
npm publish
```

Expected: `+ @cslate/shared@0.3.0`

- [ ] **Step 3: Update CSlate worktree to published version**

In `~/Projects/CSlate-feature-component-boilerplate/package.json`, update to the published version:
```json
"@cslate/shared": "^0.3.0",
```

Then:
```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm install
```

Expected: `node_modules/@cslate/shared` now resolves to `0.3.0`.

- [ ] **Step 4: Run full CSlate test suite against published package**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm test && npm run typecheck
```

Expected: all tests pass. TypeScript clean.

- [ ] **Step 5: Commit the version update**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
git add package.json package-lock.json
git commit -m "chore: upgrade @cslate/shared to 0.3.0 (adds COMPONENT_TEMPLATE)"
```

---

### Task 6: Final verification and PR readiness

- [ ] **Step 1: Review all changes in the worktree**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
git log --oneline
```

Expected output (3 commits):
```
<hash> chore: upgrade @cslate/shared to 0.3.0 (adds COMPONENT_TEMPLATE)
<hash> docs: update component boilerplate spec with discriminated union refinements
<hash> feat: inject COMPONENT_TEMPLATE as sub-agent starting point when no blueprint
```

- [ ] **Step 2: Verify sub-agent.ts diff is minimal**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
git diff main -- src/main/agent/orchestrator/sub-agent.ts
```

Expected: only the import line and the `blueprintSection` assignment changed — nothing else.

- [ ] **Step 3: Confirm the worktree is ready to merge**

```bash
cd ~/Projects/CSlate-feature-component-boilerplate
npm test && npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Use superpowers:finishing-a-development-branch skill to decide how to ship**

```
/finishing-a-development-branch
```
