# Progressive Canvas Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live `BuildingCard` on the canvas from the moment a build starts, progressing through animated phases with file-by-file status, partial renders, and a message queue so users can keep chatting.

**Architecture:** A new `buildingCards` array in `canvasStore` holds in-flight cards. The orchestrator emits three new IPC events (`agent:build:start`, `agent:build:plan`, `agent:build:partial`) that the renderer listens for in `useChat`. A renderer-side FIFO queue in `chatStore` lets users submit while building; the next message fires automatically after `agent:done`.

**Tech Stack:** Zustand, React, esbuild (Node), Vitest, Tailwind CSS, Electron IPC

---

## File Map

**New files:**
- `src/renderer/canvas/building/types.ts` — `BuildingCard`, `BuildingTask`, `BuildPhase` types
- `src/renderer/canvas/building/phrases.ts` — phase-specific phrase pools
- `src/renderer/canvas/building/PhaseStrip.tsx` — five-dot phase progress strip
- `src/renderer/canvas/building/PhraseRotator.tsx` — rotating contextual phrase
- `src/renderer/canvas/building/TaskRow.tsx` — per-file build status row
- `src/renderer/canvas/building/PartialPreview.tsx` — sandboxed partial render with code fallback
- `src/renderer/canvas/building/BuildingCard.tsx` — top-level card assembled from the above

**Modified files:**
- `src/preload/channels.ts` — add three new listen channels
- `src/renderer/store/canvasStore.ts` — add `buildingCards` state + actions
- `src/renderer/store/chatStore.ts` — add `messageQueue` + `shiftQueue` action
- `src/renderer/canvas/SlateCanvas.tsx` — render `BuildingCard` items
- `src/renderer/chat/useChat.ts` — listen to new events, queue logic
- `src/renderer/chat/FloatingChatBar.tsx` — allow input during build, show queue badge
- `src/main/agent/lib/bundler.ts` — add `bundlePartialUiTsx` (stubs missing local imports)
- `src/main/agent/orchestrator/index.ts` — emit `agent:build:start`, `agent:build:plan`, `agent:build:partial`

---

### Task 1: Types and IPC channels

**Files:**
- Create: `src/renderer/canvas/building/types.ts`
- Modify: `src/preload/channels.ts`
- Test: `src/renderer/canvas/building/__tests__/types.test.ts` (type-only, no runtime test needed — skip)

- [ ] **Step 1: Create the types file**

```typescript
// src/renderer/canvas/building/types.ts

export type BuildPhase = 'think' | 'plan' | 'build' | 'test' | 'done'

export interface BuildingTask {
  file: string        // e.g. "ui.tsx", "hooks/useWeather.ts"
  assignment: string  // human-readable: "Main view with city search"
  status: 'pending' | 'building' | 'done'
}

export interface BuildingCard {
  buildId: string          // equals tabId from agent:run
  phase: BuildPhase
  componentName?: string   // populated from agent:build:plan
  description?: string     // populated from agent:build:plan
  tasks: BuildingTask[]    // populated from agent:build:plan
  partialBundle?: string   // populated from agent:build:partial
  partialSource?: string   // fallback when bundle fails
  placement: {
    x: number
    y: number
    width: number
  }
}
```

- [ ] **Step 2: Add three new listen channels to preload**

In `src/preload/channels.ts`, add to `ALLOWED_LISTEN_CHANNELS`:

```typescript
export const ALLOWED_LISTEN_CHANNELS = [
  'bridge:fetch:resp',
  'bridge:event',
  'sandbox:load:resp',
  'sandbox:error',
  'agent:token',
  'agent:tool-call',
  'agent:tool-result',
  'agent:done',
  'agent:error',
  'agent:orchestrator:status',
  'agent:build:start',
  'agent:build:plan',
  'agent:build:partial',
] as const
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/building/types.ts src/preload/channels.ts
git commit -m "feat(building): types and IPC channels for progressive rendering"
```

---

### Task 2: Phrase pools

**Files:**
- Create: `src/renderer/canvas/building/phrases.ts`
- Test: `src/renderer/canvas/building/__tests__/phrases.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/canvas/building/__tests__/phrases.test.ts
import { describe, it, expect } from 'vitest'
import { pickPhrase, type PhraseContext } from '../phrases'

describe('pickPhrase', () => {
  it('returns a non-empty string for every phase', () => {
    const phases = ['think', 'plan', 'build', 'test', 'done'] as const
    for (const phase of phases) {
      const result = pickPhrase(phase, {})
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('fills {componentName} template', () => {
    // Run many times to hit a template string
    let filled = false
    for (let i = 0; i < 100; i++) {
      const result = pickPhrase('plan', { componentName: 'WeatherWidget' })
      if (result.includes('WeatherWidget')) { filled = true; break }
    }
    expect(filled).toBe(true)
  })

  it('fills {file} template', () => {
    let filled = false
    for (let i = 0; i < 100; i++) {
      const result = pickPhrase('build', { file: 'ui.tsx' })
      if (result.includes('ui.tsx')) { filled = true; break }
    }
    expect(filled).toBe(true)
  })

  it('does not leave unfilled template tokens when context is missing', () => {
    for (let i = 0; i < 30; i++) {
      const result = pickPhrase('build', {})
      expect(result).not.toContain('{')
      expect(result).not.toContain('}')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/renderer/canvas/building/__tests__/phrases.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Create phrases.ts**

```typescript
// src/renderer/canvas/building/phrases.ts
import type { BuildPhase } from './types'

export interface PhraseContext {
  componentName?: string
  file?: string
  task?: string
}

const pools: Record<BuildPhase, string[]> = {
  think: [
    'Let me think about this...',
    'Getting a feel for what you need...',
    'Thinking through the approach...',
    'Considering a few angles...',
    'Figuring out the best way to build this...',
    'On it...',
    "Let's see what makes sense here...",
    'Mulling this over...',
    'Looking at what we\'ve built before...',
    'Checking for similar work...',
  ],
  plan: [
    'Sketching out {componentName}...',
    'Planning the structure...',
    'Mapping out the pieces...',
    'Deciding how to organize this...',
    'Laying the groundwork...',
    'Working out the details...',
    'Got a plan forming...',
    'Breaking this down...',
    'Figuring out the right files...',
    'Shaping {componentName}...',
  ],
  build: [
    'Writing {file}...',
    'Wiring up {task}...',
    'Putting {file} together...',
    'Working on {task}...',
    'Building out {file}...',
    'Getting {file} ready...',
    'Almost done with {file}...',
    'Finishing up {file}...',
    'Coding up the logic...',
    'Pulling the pieces together...',
  ],
  test: [
    'Putting it all together...',
    'Seeing if it runs...',
    'Checking everything fits...',
    'Assembling the pieces...',
    'Making sure it works...',
    'Trying it out...',
    'One last check...',
    'Wrapping things up...',
    'Running a quick test...',
    'Almost there...',
  ],
  done: [
    'All set!',
    'Here you go!',
    'Ready for you.',
    'Done!',
    'Built and ready.',
  ],
}

function fill(phrase: string, ctx: PhraseContext): string {
  let result = phrase
  if (ctx.componentName) result = result.replace('{componentName}', ctx.componentName)
  if (ctx.file) result = result.replace('{file}', ctx.file)
  if (ctx.task) result = result.replace('{task}', ctx.task)
  // Remove unfilled tokens — fall back to a generic phrase instead
  if (result.includes('{')) {
    const pool = pools[result.startsWith('Writing') ? 'build' : 'think']
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return result
}

export function pickPhrase(phase: BuildPhase, ctx: PhraseContext): string {
  const pool = pools[phase]
  const phrase = pool[Math.floor(Math.random() * pool.length)]
  return fill(phrase, ctx)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/renderer/canvas/building/__tests__/phrases.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/building/phrases.ts src/renderer/canvas/building/__tests__/phrases.test.ts
git commit -m "feat(building): phrase pools with template filling"
```

---

### Task 3: canvasStore — buildingCards

**Files:**
- Modify: `src/renderer/store/canvasStore.ts`
- Test: `src/renderer/__tests__/canvasStore.building.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/__tests__/canvasStore.building.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import type { BuildingCard } from '../canvas/building/types'

const card: BuildingCard = {
  buildId: 'test-build-1',
  phase: 'think',
  tasks: [],
  placement: { x: 2, y: 2, width: 50 },
}

describe('canvasStore buildingCards', () => {
  beforeEach(() => {
    useCanvasStore.setState({ buildingCards: [] })
  })

  it('starts with no building cards', () => {
    expect(useCanvasStore.getState().buildingCards).toHaveLength(0)
  })

  it('adds a building card', () => {
    useCanvasStore.getState().addBuildingCard(card)
    expect(useCanvasStore.getState().buildingCards).toHaveLength(1)
    expect(useCanvasStore.getState().buildingCards[0].buildId).toBe('test-build-1')
  })

  it('updates a building card by buildId', () => {
    useCanvasStore.getState().addBuildingCard(card)
    useCanvasStore.getState().updateBuildingCard('test-build-1', { phase: 'plan', componentName: 'WeatherWidget' })
    const updated = useCanvasStore.getState().buildingCards[0]
    expect(updated.phase).toBe('plan')
    expect(updated.componentName).toBe('WeatherWidget')
  })

  it('removes a building card by buildId', () => {
    useCanvasStore.getState().addBuildingCard(card)
    useCanvasStore.getState().removeBuildingCard('test-build-1')
    expect(useCanvasStore.getState().buildingCards).toHaveLength(0)
  })

  it('update on unknown buildId is a no-op', () => {
    useCanvasStore.getState().addBuildingCard(card)
    useCanvasStore.getState().updateBuildingCard('nope', { phase: 'done' })
    expect(useCanvasStore.getState().buildingCards[0].phase).toBe('think')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/renderer/__tests__/canvasStore.building.test.ts
```

Expected: FAIL (addBuildingCard is not a function)

- [ ] **Step 3: Add buildingCards to canvasStore**

Replace the entire `src/renderer/store/canvasStore.ts`:

```typescript
import { create } from 'zustand'
import type { BuildingCard } from '../canvas/building/types'

export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasComponent {
  componentId: string
  bundle: string
  placement: Placement
  manifest: unknown
}

export interface CanvasPreview {
  bundle: string
  files: Record<string, string>
  manifest: unknown
  placement?: Placement
}

interface CanvasState {
  components: CanvasComponent[]
  preview: CanvasPreview | null
  buildingCards: BuildingCard[]

  hydrate(components: CanvasComponent[]): void
  addComponent(comp: CanvasComponent): void
  removeComponent(componentId: string): void
  setPreview(preview: CanvasPreview): void
  clearPreview(): void
  addBuildingCard(card: BuildingCard): void
  updateBuildingCard(buildId: string, patch: Partial<Omit<BuildingCard, 'buildId'>>): void
  removeBuildingCard(buildId: string): void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  components: [],
  preview: null,
  buildingCards: [],

  hydrate: (components) => set({ components }),

  addComponent: (comp) => set((s) => ({
    components: [
      ...s.components.filter(c => c.componentId !== comp.componentId),
      comp,
    ],
  })),

  removeComponent: (componentId) => set((s) => ({
    components: s.components.filter(c => c.componentId !== componentId),
  })),

  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),

  addBuildingCard: (card) => set((s) => ({
    buildingCards: [...s.buildingCards, card],
  })),

  updateBuildingCard: (buildId, patch) => set((s) => ({
    buildingCards: s.buildingCards.map(c =>
      c.buildId === buildId ? { ...c, ...patch } : c
    ),
  })),

  removeBuildingCard: (buildId) => set((s) => ({
    buildingCards: s.buildingCards.filter(c => c.buildId !== buildId),
  })),
}))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/renderer/__tests__/canvasStore.building.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/canvasStore.ts src/renderer/__tests__/canvasStore.building.test.ts
git commit -m "feat(building): add buildingCards to canvasStore"
```

---

### Task 4: chatStore — message queue

**Files:**
- Modify: `src/renderer/store/chatStore.ts`
- Test: `src/renderer/__tests__/chatStore.test.ts` (extend existing)

- [ ] **Step 1: Write the failing tests** (add to existing `src/renderer/__tests__/chatStore.test.ts`)

Add this describe block at the end of the existing file:

```typescript
describe('chatStore messageQueue', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('starts with empty queue', () => {
    expect(useChatStore.getState().messageQueue).toEqual([])
  })

  it('enqueues a message', () => {
    useChatStore.getState().enqueueMessage('hello')
    expect(useChatStore.getState().messageQueue).toEqual(['hello'])
  })

  it('shiftQueue removes and returns first message', () => {
    useChatStore.getState().enqueueMessage('first')
    useChatStore.getState().enqueueMessage('second')
    const next = useChatStore.getState().shiftQueue()
    expect(next).toBe('first')
    expect(useChatStore.getState().messageQueue).toEqual(['second'])
  })

  it('shiftQueue returns undefined when empty', () => {
    const next = useChatStore.getState().shiftQueue()
    expect(next).toBeUndefined()
  })

  it('reset clears the queue', () => {
    useChatStore.getState().enqueueMessage('hello')
    useChatStore.getState().reset()
    expect(useChatStore.getState().messageQueue).toEqual([])
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm test -- src/renderer/__tests__/chatStore.test.ts
```

Expected: some FAIL (enqueueMessage is not a function)

- [ ] **Step 3: Add queue to chatStore**

Replace `src/renderer/store/chatStore.ts`:

```typescript
import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  panelOpen: boolean
  turnCount: number
  publishState: 'hidden' | 'prompting' | 'publishing' | 'published' | 'declined'
  statusLabel: string
  messageQueue: string[]
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setPanelOpen(v: boolean): void
  incrementTurnCount(): void
  setPublishState(s: ChatState['publishState']): void
  enqueueMessage(msg: string): void
  shiftQueue(): string | undefined
  reset(): void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  panelOpen: false,
  turnCount: 0,
  publishState: 'hidden',
  statusLabel: '',
  messageQueue: [],
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  incrementTurnCount: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  setPublishState: (publishState) => set({ publishState }),
  enqueueMessage: (msg) => set((s) => ({ messageQueue: [...s.messageQueue, msg] })),
  shiftQueue: () => {
    const { messageQueue } = get()
    if (messageQueue.length === 0) return undefined
    set({ messageQueue: messageQueue.slice(1) })
    return messageQueue[0]
  },
  reset: () => set({
    messages: [],
    status: 'idle',
    panelOpen: false,
    turnCount: 0,
    publishState: 'hidden',
    statusLabel: '',
    messageQueue: [],
  }),
}))
```

- [ ] **Step 4: Run all chatStore tests to verify they pass**

```bash
npm test -- src/renderer/__tests__/chatStore.test.ts
```

Expected: PASS (all tests including new queue tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/chatStore.ts src/renderer/__tests__/chatStore.test.ts
git commit -m "feat(building): add message queue to chatStore"
```

---

### Task 5: Partial bundler

**Files:**
- Modify: `src/main/agent/lib/bundler.ts`
- Test: `src/main/agent/lib/__tests__/bundler.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** (add to existing bundler test file)

Add this describe block at the end of `src/main/agent/lib/__tests__/bundler.test.ts`:

```typescript
import { bundlePartialUiTsx } from '../bundler'

describe('bundlePartialUiTsx', () => {
  it('bundles ui.tsx that has no imports', async () => {
    const bundle = await bundlePartialUiTsx(
      'export default function App() { return null }'
    )
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string) => {
      if (mod === 'react') return { createElement: () => null }
      throw new Error(`unexpected: ${mod}`)
    }
    new Function('require', 'module', 'exports', bundle)(_require, _module, _module.exports)
    expect(typeof _module.exports['default']).toBe('function')
  })

  it('stubs missing relative imports instead of throwing', async () => {
    const bundle = await bundlePartialUiTsx(`
      import { useWeather } from './hooks/useWeather'
      import type { WeatherData } from './types'
      export default function App() { return null }
    `)
    expect(bundle).toBeTruthy()
    expect(typeof bundle).toBe('string')
  })

  it('still externalizes react', async () => {
    const bundle = await bundlePartialUiTsx(
      "import React from 'react'\nexport default function App() { return React.createElement('div') }"
    )
    expect(bundle).toContain('require')
    expect(bundle).toContain('react')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/main/agent/lib/__tests__/bundler.test.ts
```

Expected: FAIL on the `bundlePartialUiTsx` tests (not exported)

- [ ] **Step 3: Add bundlePartialUiTsx to bundler.ts**

Add this export to the end of `src/main/agent/lib/bundler.ts`:

```typescript
/**
 * Bundle a single ui.tsx string for partial preview.
 * Stubs all relative imports with empty objects so missing
 * hook/type files don't block the bundle.
 */
export async function bundlePartialUiTsx(uiTsxContent: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cslate-partial-'))
  try {
    await writeFile(join(tmpDir, 'ui.tsx'), uiTsxContent, 'utf-8')

    const result = await esbuild.build({
      entryPoints: [join(tmpDir, 'ui.tsx')],
      bundle: true,
      format: 'cjs',
      target: 'es2020',
      write: false,
      logLevel: 'silent',
      external: EXTERNALS,
      plugins: [
        {
          name: 'stub-missing-locals',
          setup(build) {
            // Stub every relative import — only ui.tsx exists in tmpDir
            build.onResolve({ filter: /^\./ }, () => ({
              path: 'stub',
              namespace: 'stub-missing',
            }))
            build.onLoad({ filter: /.*/, namespace: 'stub-missing' }, () => ({
              contents: 'module.exports = {}',
              loader: 'js',
            }))
          },
        },
      ],
    })

    if (result.errors.length > 0) {
      throw new Error(result.errors.map(e => e.text).join('\n'))
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
```

- [ ] **Step 4: Run all bundler tests to verify they pass**

```bash
npm test -- src/main/agent/lib/__tests__/bundler.test.ts
```

Expected: PASS (all tests including 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/lib/bundler.ts src/main/agent/lib/__tests__/bundler.test.ts
git commit -m "feat(building): add bundlePartialUiTsx with stub plugin for missing imports"
```

---

### Task 6: Orchestrator — emit new events

**Files:**
- Modify: `src/main/agent/orchestrator/index.ts`

- [ ] **Step 1: Import bundlePartialUiTsx at the top of orchestrator/index.ts**

Add to the imports in `src/main/agent/orchestrator/index.ts`:

```typescript
import { bundlePartialUiTsx } from '../lib/bundler'
```

- [ ] **Step 2: Emit agent:build:start at the top of stream()**

In `orchestrator/index.ts`, find this line near the end of `stream()`:

```typescript
this.log.info({ modelId, message }, 'orchestrator starting')
ctx.sender.send('agent:orchestrator:status', { phase: 'understand' })
```

Replace with:

```typescript
this.log.info({ modelId, message }, 'orchestrator starting')
ctx.sender.send('agent:build:start', { buildId: ctx.tabId })
ctx.sender.send('agent:orchestrator:status', { phase: 'understand' })
```

- [ ] **Step 3: Emit agent:build:plan inside planComponent.execute**

Find the `planComponent` tool definition. Its `execute` currently returns:

```typescript
execute: async (plan) => {
  this.log.info(
    { componentId: plan.componentId, taskCount: plan.tasks.length },
    'plan created'
  )
  return {
    planned: true,
    componentId: plan.componentId,
    taskCount: plan.tasks.length,
  }
},
```

Replace with:

```typescript
execute: async (plan) => {
  this.log.info(
    { componentId: plan.componentId, taskCount: plan.tasks.length },
    'plan created'
  )
  ctx.sender.send('agent:build:plan', {
    buildId: ctx.tabId,
    componentId: plan.componentId,
    description: plan.requirements,
    tasks: plan.tasks.map(t => ({ file: t.file, assignment: t.assignment })),
  })
  return {
    planned: true,
    componentId: plan.componentId,
    taskCount: plan.tasks.length,
  }
},
```

- [ ] **Step 4: Emit agent:build:partial after ui.tsx worker completes**

In `dispatchSubAgents.execute`, find the `.then((result) => { ... return result })` inside `Promise.all`. Replace it with:

```typescript
return spawnBuildAgent({
  task,
  contract: input.contract,
  modelId,
  registry: ctx.registry,
}).then(async (result) => {
  ctx.sender.send('agent:orchestrator:status', {
    phase: 'worker',
    workerId: i,
    file: task.file,
    status: 'done',
  })
  // Attempt partial bundle for ui.tsx so the renderer can show a preview
  if (task.file === 'ui.tsx' && result.status === 'success') {
    try {
      const bundle = await bundlePartialUiTsx(result.code)
      ctx.sender.send('agent:build:partial', { buildId: ctx.tabId, bundle })
    } catch {
      ctx.sender.send('agent:build:partial', {
        buildId: ctx.tabId,
        source: result.code,
      })
    }
  }
  return result
})
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/orchestrator/index.ts
git commit -m "feat(building): orchestrator emits build:start, build:plan, build:partial"
```

---

### Task 7: PhaseStrip component

**Files:**
- Create: `src/renderer/canvas/building/PhaseStrip.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/canvas/building/PhaseStrip.tsx
import React from 'react'
import type { BuildPhase } from './types'

const PHASES: { key: BuildPhase; label: string }[] = [
  { key: 'think', label: 'Think' },
  { key: 'plan', label: 'Plan' },
  { key: 'build', label: 'Build' },
  { key: 'test', label: 'Test' },
  { key: 'done', label: 'Done' },
]

const PHASE_ORDER: BuildPhase[] = ['think', 'plan', 'build', 'test', 'done']

function phaseIndex(phase: BuildPhase): number {
  return PHASE_ORDER.indexOf(phase)
}

interface Props {
  phase: BuildPhase
}

export function PhaseStrip({ phase }: Props) {
  const current = phaseIndex(phase)

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((p, i) => {
        const isDone = i < current
        const isActive = i === current

        return (
          <React.Fragment key={p.key}>
            <div className="flex items-center gap-1">
              <div
                className={[
                  'w-1.5 h-1.5 rounded-full transition-all duration-300',
                  isDone ? 'bg-primary' : '',
                  isActive ? 'bg-primary/80 animate-pulse' : '',
                  !isDone && !isActive ? 'bg-border' : '',
                ].join(' ')}
              />
              <span
                className={[
                  'text-[10px] transition-colors duration-300',
                  isDone ? 'text-primary/60' : '',
                  isActive ? 'text-primary' : '',
                  !isDone && !isActive ? 'text-muted/40' : '',
                ].join(' ')}
              >
                {p.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div
                className={[
                  'flex-1 h-px min-w-[8px] transition-colors duration-300',
                  i < current ? 'bg-primary/40' : 'bg-border/40',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/building/PhaseStrip.tsx
git commit -m "feat(building): PhaseStrip component"
```

---

### Task 8: PhraseRotator component

**Files:**
- Create: `src/renderer/canvas/building/PhraseRotator.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/canvas/building/PhraseRotator.tsx
import React from 'react'
import type { BuildPhase } from './types'
import { pickPhrase, type PhraseContext } from './phrases'

interface Props {
  phase: BuildPhase
  context: PhraseContext
}

export function PhraseRotator({ phase, context }: Props) {
  const [phrase, setPhrase] = React.useState(() => pickPhrase(phase, context))
  const [visible, setVisible] = React.useState(true)

  // Re-pick when phase or active file changes
  React.useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setPhrase(pickPhrase(phase, context))
      setVisible(true)
    }, 150)
    return () => clearTimeout(t)
  }, [phase, context.file, context.componentName])

  // Rotate every 4 seconds during long phases
  React.useEffect(() => {
    if (phase === 'done') return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setPhrase(pickPhrase(phase, context))
        setVisible(true)
      }, 150)
    }, 4000)
    return () => clearInterval(interval)
  }, [phase, context.file, context.componentName])

  return (
    <p
      className="text-sm text-muted transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {phrase}
    </p>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/building/PhraseRotator.tsx
git commit -m "feat(building): PhraseRotator with crossfade and 4s rotation"
```

---

### Task 9: TaskRow component

**Files:**
- Create: `src/renderer/canvas/building/TaskRow.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/canvas/building/TaskRow.tsx
import React from 'react'
import type { BuildingTask } from './types'

interface Props {
  task: BuildingTask
}

export function TaskRow({ task }: Props) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Status icon */}
      <div className="flex-shrink-0 w-4 flex items-center justify-center">
        {task.status === 'done' && (
          <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
        {task.status === 'building' && (
          <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
        )}
        {task.status === 'pending' && (
          <div className="w-1.5 h-1.5 rounded-full bg-border" />
        )}
      </div>

      {/* Assignment + filename */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={[
            'text-xs truncate',
            task.status === 'done' ? 'text-muted/60 line-through' : '',
            task.status === 'building' ? 'text-text' : '',
            task.status === 'pending' ? 'text-muted/50' : '',
          ].join(' ')}
        >
          {task.assignment}
        </span>
        <span className="text-[10px] text-muted/40 flex-shrink-0 font-mono">
          {task.file}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/building/TaskRow.tsx
git commit -m "feat(building): TaskRow with pending/building/done states"
```

---

### Task 10: PartialPreview component

**Files:**
- Create: `src/renderer/canvas/building/PartialPreview.tsx`

- [ ] **Step 1: Create the component**

This wraps the existing `DynamicComponent` but catches failures and shows source code as fallback.

```tsx
// src/renderer/canvas/building/PartialPreview.tsx
import React from 'react'
import { DynamicComponent } from '../../sandbox/DynamicComponent'

interface Props {
  bundle?: string
  source?: string
}

class BundleErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function CodeBlock({ source }: { source: string }) {
  const lines = source.split('\n').slice(0, 25)
  return (
    <pre className="text-[10px] font-mono text-muted/70 overflow-hidden leading-relaxed p-2 bg-background/50 rounded border border-border/30">
      {lines.join('\n')}
      {source.split('\n').length > 25 && '\n…'}
    </pre>
  )
}

export function PartialPreview({ bundle, source }: Props) {
  if (!bundle && !source) return null

  return (
    <div className="mt-1 rounded border border-primary/20 overflow-hidden">
      <div className="px-2 py-1 bg-primary/5 border-b border-primary/10">
        <span className="text-[10px] text-primary/60 font-medium">Preview</span>
      </div>
      <div className="max-h-48 overflow-auto">
        {bundle ? (
          <BundleErrorBoundary fallback={source ? <CodeBlock source={source} /> : null}>
            <div className="p-2">
              <DynamicComponent bundle={bundle} />
            </div>
          </BundleErrorBoundary>
        ) : source ? (
          <CodeBlock source={source} />
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/building/PartialPreview.tsx
git commit -m "feat(building): PartialPreview with ErrorBoundary and code fallback"
```

---

### Task 11: BuildingCard component

**Files:**
- Create: `src/renderer/canvas/building/BuildingCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/canvas/building/BuildingCard.tsx
import React from 'react'
import type { BuildingCard as BuildingCardType } from './types'
import { PhaseStrip } from './PhaseStrip'
import { PhraseRotator } from './PhraseRotator'
import { TaskRow } from './TaskRow'
import { PartialPreview } from './PartialPreview'

const GRID_PX = 8

interface Props {
  card: BuildingCardType
}

export function BuildingCard({ card }: Props) {
  const { x, y, width } = card.placement
  const activeTask = card.tasks.find(t => t.status === 'building')

  const showTaskList = card.tasks.length > 0 && (card.phase === 'build' || card.phase === 'test')

  const phraseContext = {
    componentName: card.componentName,
    file: activeTask?.file,
    task: activeTask?.assignment,
  }

  return (
    <div
      className="absolute bg-surface rounded-lg shadow-lg border border-border/40 overflow-hidden"
      style={{
        left: x * GRID_PX,
        top: y * GRID_PX,
        width: width * GRID_PX,
      }}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Phase strip */}
        <PhaseStrip phase={card.phase} />

        {/* Component name + phrase */}
        <div className="flex flex-col gap-0.5">
          {card.componentName && (
            <p className="text-sm font-medium text-text leading-tight">
              {card.componentName}
            </p>
          )}
          <PhraseRotator phase={card.phase} context={phraseContext} />
        </div>

        {/* Task rows (build phase: individual rows; test phase: summary) */}
        {showTaskList && (
          <div className="flex flex-col gap-0.5">
            {card.phase === 'build' ? (
              card.tasks.map(task => (
                <TaskRow key={task.file} task={task} />
              ))
            ) : (
              <p className="text-xs text-muted/60">
                {card.tasks.length} file{card.tasks.length !== 1 ? 's' : ''} assembled...
              </p>
            )}
          </div>
        )}

        {/* Partial preview */}
        {(card.partialBundle || card.partialSource) && (
          <PartialPreview bundle={card.partialBundle} source={card.partialSource} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/building/BuildingCard.tsx
git commit -m "feat(building): BuildingCard assembled from PhaseStrip, PhraseRotator, TaskRow, PartialPreview"
```

---

### Task 12: SlateCanvas — render BuildingCards

**Files:**
- Modify: `src/renderer/canvas/SlateCanvas.tsx`

- [ ] **Step 1: Update SlateCanvas to render BuildingCards**

Replace `src/renderer/canvas/SlateCanvas.tsx`:

```tsx
import React from 'react'
import { useCanvasStore, type CanvasComponent } from '../store/canvasStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'
import { BuildingCard } from './building/BuildingCard'

const GRID_PX = 8

function CanvasItem({ component }: { component: CanvasComponent }) {
  const { x, y, width, height } = component.placement
  return (
    <div
      className="absolute bg-surface rounded-lg shadow-lg overflow-auto"
      style={{
        left: x * GRID_PX,
        top: y * GRID_PX,
        width: width * GRID_PX,
        height: height * GRID_PX,
      }}
    >
      <DynamicComponent bundle={component.bundle} />
    </div>
  )
}

export function SlateCanvas() {
  const components = useCanvasStore((s) => s.components)
  const preview = useCanvasStore((s) => s.preview)
  const buildingCards = useCanvasStore((s) => s.buildingCards)
  const shortcut = window.electron.platform === 'darwin' ? '⌘K' : 'Ctrl+K'
  const isEmpty = components.length === 0 && !preview && buildingCards.length === 0

  return (
    <div className="flex-1 bg-background relative overflow-auto">
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
        <>
          {components.map((comp) => (
            <CanvasItem key={comp.componentId} component={comp} />
          ))}
          {buildingCards.map((card) => (
            <BuildingCard key={card.buildId} card={card} />
          ))}
          {preview && (
            <div
              className="absolute bg-surface rounded-lg shadow-lg overflow-auto ring-2 ring-primary/30"
              style={preview.placement ? {
                left: preview.placement.x * GRID_PX,
                top: preview.placement.y * GRID_PX,
                width: preview.placement.width * GRID_PX,
                height: preview.placement.height * GRID_PX,
              } : {
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '80%',
                maxHeight: '80%',
              }}
            >
              <DynamicComponent bundle={preview.bundle} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/SlateCanvas.tsx
git commit -m "feat(building): render BuildingCards in SlateCanvas"
```

---

### Task 13: useChat — new event listeners and queue

**Files:**
- Modify: `src/renderer/chat/useChat.ts`

- [ ] **Step 1: Replace useChat.ts**

The key changes:
1. Generate `tabId` before the `try` block so it's available for cleanup
2. Add listeners for `agent:build:start`, `agent:build:plan`, `agent:build:partial`
3. On `writeComponent` success, also remove the building card
4. When `status === 'generating'`, enqueue rather than run
5. On completion, drain the queue

```typescript
import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { useCanvasStore, type Placement } from '../store/canvasStore'
import type { BuildingTask } from '../canvas/building/types'

const MAX_HISTORY_MESSAGES = 6

// Default placement for the BuildingCard before the plan arrives
const DEFAULT_BUILDING_PLACEMENT = { x: 2, y: 2, width: 50 }

export function useChat() {
  const { addMessage, setStatus, incrementTurnCount, setPublishState } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // If already building, queue and return
    if (useChatStore.getState().status === 'generating') {
      useChatStore.getState().enqueueMessage(text)
      return
    }

    // Capture history BEFORE adding user message
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPublishState('hidden')

    // Generate tabId here so we can reference it in event handlers below
    const tabId = crypto.randomUUID()

    // Buffer streaming tokens into a single assistant message
    let streamedContent = ''
    let streamMessageAdded = false

    const offToken = window.electron.on('agent:token', (data: unknown) => {
      const d = data as { delta: string }
      streamedContent += d.delta
      if (!streamMessageAdded) {
        addMessage({ role: 'assistant', content: streamedContent })
        streamMessageAdded = true
      } else {
        useChatStore.setState(s => {
          const messages = [...s.messages]
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: streamedContent }
          }
          return { messages }
        })
      }
    })

    // Building card: start
    const offBuildStart = window.electron.on('agent:build:start', (data: unknown) => {
      const d = data as { buildId: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().addBuildingCard({
        buildId: tabId,
        phase: 'think',
        tasks: [],
        placement: DEFAULT_BUILDING_PLACEMENT,
      })
    })

    // Building card: plan arrived
    const offBuildPlan = window.electron.on('agent:build:plan', (data: unknown) => {
      const d = data as {
        buildId: string
        componentId: string
        description: string
        tasks: Array<{ file: string; assignment: string }>
      }
      if (d.buildId !== tabId) return
      const tasks: BuildingTask[] = d.tasks.map(t => ({
        file: t.file,
        assignment: t.assignment,
        status: 'pending' as const,
      }))
      useCanvasStore.getState().updateBuildingCard(tabId, {
        phase: 'plan',
        componentName: d.componentId.replace(/_/g, ' '),
        description: d.description,
        tasks,
      })
    })

    // Building card: partial render ready
    const offBuildPartial = window.electron.on('agent:build:partial', (data: unknown) => {
      const d = data as { buildId: string; bundle?: string; source?: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().updateBuildingCard(tabId, {
        partialBundle: d.bundle,
        partialSource: d.source,
      })
    })

    // Route tool results to canvasStore
    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as {
        tool: string
        result: {
          success?: boolean
          bundle?: string
          files?: Record<string, string>
          manifest?: unknown
          placement?: Placement
          componentId?: string
        }
      }

      if (d.tool === 'renderComponent' && d.result?.success) {
        const { bundle, files, manifest, placement } = d.result
        if (bundle && files && manifest) {
          useCanvasStore.getState().setPreview({ bundle, files, manifest, placement })
          setPublishState('prompting')
        }
      } else if (d.tool === 'writeComponent' && d.result?.success) {
        const { componentId, bundle, placement, manifest } = d.result
        if (componentId && bundle && placement && manifest) {
          useCanvasStore.getState().addComponent({ componentId, bundle, placement, manifest })
          useCanvasStore.getState().clearPreview()
          useCanvasStore.getState().removeBuildingCard(tabId)
          setPublishState('prompting')
        }
      }
    })

    // Orchestrator phase → update building card phase, task statuses, and statusLabel
    const offOrchestratorStatus = window.electron.on('agent:orchestrator:status', (data: unknown) => {
      const d = data as { phase: string; workerId?: number; file?: string; workerCount?: number; status?: string }

      // Keep statusLabel updated for ChatPanel
      const phaseLabels: Record<string, string> = {
        understand: 'Understanding your request...',
        search: 'Searching for blueprints...',
        plan: 'Planning component...',
        dispatch: `Building ${d.workerCount ?? ''} files in parallel...`,
        worker: d.file ? `Building ${d.file}...` : 'Building...',
        validate: 'Validating component...',
        fix: 'Fixing issues...',
        ship: 'Component ready!',
      }
      useChatStore.setState({ statusLabel: phaseLabels[d.phase] ?? d.phase })

      // Map fine-grained phases to BuildPhase for the BuildingCard
      const phaseMap: Record<string, 'think' | 'plan' | 'build' | 'test' | 'done'> = {
        understand: 'think',
        search: 'think',
        plan: 'plan',
        dispatch: 'build',
        worker: 'build',
        validate: 'test',
        fix: 'test',
        ship: 'done',
      }
      const buildPhase = phaseMap[d.phase]
      if (buildPhase) {
        useCanvasStore.getState().updateBuildingCard(tabId, { phase: buildPhase })
      }

      // Update individual task row status
      if (d.phase === 'worker' && d.file) {
        const { buildingCards } = useCanvasStore.getState()
        const card = buildingCards.find(c => c.buildId === tabId)
        if (card) {
          const updatedTasks: BuildingTask[] = card.tasks.map(t =>
            t.file === d.file
              ? { ...t, status: (d.status === 'done' ? 'done' : 'building') as BuildingTask['status'] }
              : t
          )
          useCanvasStore.getState().updateBuildingCard(tabId, { tasks: updatedTasks })
        }
      }
    })

    const offError = window.electron.on('agent:error', (data: unknown) => {
      const d = data as { message: string; code?: string }
      if (d.code === 'UNCONFIGURED_LLM') {
        useAppStore.getState().openConfig('models')
        setStatus('idle')
        addMessage({
          role: 'assistant',
          content: "No AI provider configured — I've opened Settings so you can set one up."
        })
      } else {
        setStatus('error')
        addMessage({ role: 'assistant', content: `Error: ${d.message}` })
      }
      // Clean up any stray building card on error
      useCanvasStore.getState().removeBuildingCard(tabId)
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir: '',
        tabId,
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })
      setStatus('idle')
      incrementTurnCount()
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offBuildStart()
      offBuildPlan()
      offBuildPartial()
      offToolResult()
      offOrchestratorStatus()
      offError()
      useChatStore.setState({ statusLabel: '' })
      // Clean up building card if it wasn't removed by writeComponent
      useCanvasStore.getState().removeBuildingCard(tabId)
      // Drain queue
      const next = useChatStore.getState().shiftQueue()
      if (next) setTimeout(() => submit(next), 0)
    }
  }, [addMessage, setStatus, incrementTurnCount, setPublishState])

  return { submit }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run useChat tests**

```bash
npm test -- src/renderer/__tests__/useChat.test.ts
```

Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/chat/useChat.ts
git commit -m "feat(building): useChat listens to build events, updates canvas, queues messages"
```

---

### Task 14: FloatingChatBar — allow input during build, show queue badge

**Files:**
- Modify: `src/renderer/chat/FloatingChatBar.tsx`

- [ ] **Step 1: Update FloatingChatBar**

Three changes:
1. Remove `disabled` from the input (allow typing while building)
2. Allow submission while building (useChat.submit handles queuing)
3. Show queue badge when `messageQueue.length > 0`

Replace `src/renderer/chat/FloatingChatBar.tsx`:

```tsx
import React, { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChatStore } from '../store/chatStore'

interface Props {
  open: boolean
  nudgeDismissed: boolean
  onSubmit(text: string): void
  onDismiss(): void
  onOpenPanel(): void
  onDismissNudge(): void
}

export function FloatingChatBar({ open, nudgeDismissed, onSubmit, onDismiss, onOpenPanel, onDismissNudge }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const turnCount = useChatStore((s) => s.turnCount)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const messageQueue = useChatStore((s) => s.messageQueue)

  const hasMessages = messages.length > 0
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === 'assistant')

  const agentResponseLong = (lastAgentMsg?.content.length ?? 0) > 300
  const showNudge = !nudgeDismissed && (agentResponseLong || turnCount >= 5)
  const isBuilding = status === 'generating'
  const queueCount = messageQueue.length

  useEffect(() => {
    if (open && !hasMessages) inputRef.current?.focus()
  }, [open, hasMessages])

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue('')
  }

  if (panelOpen) return null
  if (!open && !hasMessages) return null

  return (
    <div className="chat-float-enter fixed bottom-6 left-1/2 z-50 w-[480px] flex flex-col gap-2 pointer-events-none"
         style={{ transform: 'translateX(-50%)' }}>

      {/* Exchange mode: latest messages */}
      {hasMessages && (
        <div className="flex flex-col gap-2 pointer-events-auto">
          {lastUserMsg && (
            <div className="msg-enter flex justify-end">
              <span className="bg-primary/10 border border-primary/20 text-accent text-sm px-3 py-1.5 rounded-full max-w-[80%] truncate">
                {lastUserMsg.content.length > 80
                  ? lastUserMsg.content.slice(0, 80) + '…'
                  : lastUserMsg.content}
              </span>
            </div>
          )}
          {lastAgentMsg && (
            <div className="msg-enter relative bg-[rgba(26,26,35,0.85)] backdrop-blur-xl border border-white/[0.07] rounded-2xl px-4 py-3 text-sm text-text leading-relaxed overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className={agentResponseLong ? 'max-h-[120px] overflow-hidden' : ''}>
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
                      return inline
                        ? <code className="bg-background rounded px-1 text-text font-mono text-xs border border-border/40" {...props}>{children}</code>
                        : <code className="block bg-background border border-border rounded-md p-3 overflow-x-auto font-mono text-xs mt-2" {...props}>{children}</code>
                    }
                  }}
                >
                  {agentResponseLong
                    ? lastAgentMsg.content.slice(0, 300)
                    : lastAgentMsg.content}
                </ReactMarkdown>
              </div>
              {agentResponseLong && (
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[rgba(26,26,35,0.95)] to-transparent pointer-events-none" />
              )}
            </div>
          )}
          {showNudge && (
            <div className="flex items-center justify-between text-xs text-muted/60 px-1">
              <span>
                Conversation getting long —{' '}
                <button
                  onClick={() => { onOpenPanel(); onDismissNudge() }}
                  className="text-muted hover:text-text underline transition-colors duration-150"
                >
                  Open full chat →
                </button>
              </span>
              <button
                onClick={onDismissNudge}
                className="text-muted/40 hover:text-muted transition-colors duration-150 ml-2"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="bg-[rgba(26,26,35,0.88)] backdrop-blur-xl border border-white/[0.08] rounded-full px-4 py-2.5 flex items-center gap-3 shadow-[0_16px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] pointer-events-auto">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape' && !hasMessages) onDismiss()
          }}
          placeholder={isBuilding
            ? queueCount > 0
              ? `${queueCount} queued...`
              : 'Queue a message...'
            : 'Ask anything (⌘K)'}
          className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-muted/50"
        />
        {isBuilding && queueCount === 0 ? (
          <span className="flex items-center gap-1 flex-shrink-0">
            <span className="generating-dot" />
            <span className="generating-dot" />
            <span className="generating-dot" />
          </span>
        ) : isBuilding && queueCount > 0 ? (
          <span className="text-[10px] text-primary/60 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5 flex-shrink-0">
            {queueCount} queued
          </span>
        ) : value ? (
          <button
            onClick={handleSubmit}
            className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors duration-150 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
            aria-label="Send"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run FloatingChatBar tests**

```bash
npm test -- src/renderer/__tests__/FloatingChatBar.test.tsx
```

Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/chat/FloatingChatBar.tsx
git commit -m "feat(building): allow input during build with queue badge in FloatingChatBar"
```

---

### Task 15: Full test run and smoke check

**Files:** none modified

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Start dev and manually test the flow**

```bash
npm run dev
```

1. Open the app
2. Ask the agent to "make a simple counter component"
3. Verify: BuildingCard appears on canvas almost immediately with "Think" phase active
4. Verify: Card updates to "Plan" and shows component name + task rows when plan arrives
5. Verify: Task rows update from pending → building → done as workers run
6. Verify: Partial preview appears in the card after `ui.tsx` builds
7. Verify: Card transitions to "Test" phase (task rows collapse)
8. Verify: Card disappears and real component appears when `writeComponent` completes
9. Verify: While building, typing in the chat bar queues the message (badge shows "1 queued")
10. Verify: Queued message fires automatically after the build completes

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: progressive canvas rendering with BuildingCard, partial previews, and message queue"
```
