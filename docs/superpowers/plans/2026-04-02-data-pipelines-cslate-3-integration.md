# Data Pipelines — CSlate Integration (Orchestrator + IPC + Bridge + UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate pipelines into the orchestrator build flow, add IPC channels for pipeline lifecycle, extend the component bridge with pipeline access, and create the renderer-side pipelineStore + pipeline panel UI.

**Architecture:** The orchestrator's plan phase produces unified BuildPlans with pipelines + components + wiring. IPC handlers bridge renderer ↔ executor. The component sandbox bridge gains `pipeline()` and `pipelineSubscribe()` methods. A Zustand pipelineStore manages renderer state.

**Tech Stack:** TypeScript, Electron IPC, Zustand, React, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-data-pipelines-design.md` — Sections 3, 4, 6

**Depends on:** Plan 1 (Runtime Core) + Plan 2 (Agent Tools)

---

## File Map

### New Files

```
src/main/ipc/pipeline.ts                  # Pipeline IPC handlers (lifecycle, data, subscriptions)
src/renderer/store/pipelineStore.ts        # Zustand store for pipeline state
src/renderer/pipeline/PipelinePanel.tsx     # Pipeline management UI panel
```

### Modified Files

```
src/preload/channels.ts                    # Add pipeline IPC channels
src/main/agent/orchestrator/types.ts       # BuildPlan gains pipelines + wiring fields
src/main/agent/orchestrator/index.ts       # Plan/dispatch/assemble/ship phases handle pipelines
src/main/agent/orchestrator/sub-agent.ts   # Pipeline sub-agent dispatch
src/main/agent/router.ts                   # Add pipeline-wirer to skill routing
src/renderer/sandbox/DynamicComponent.tsx   # Bridge gains pipeline/pipelineSubscribe methods
src/shared/agentTypes.ts                   # Pipeline-related agent message types
```

---

### Task 1: Add Pipeline IPC Channels

**Files:**
- Modify: `src/preload/channels.ts`

- [ ] **Step 1: Read current channels.ts**

Read: `src/preload/channels.ts`

- [ ] **Step 2: Add pipeline channels**

Add to the appropriate channel arrays (invoke, send, listen):

```typescript
// Invoke channels (renderer → main, with reply)
'pipeline:list',
'pipeline:get-data',
'pipeline:start',
'pipeline:stop',
'pipeline:status',

// Send channels (renderer → main, fire-and-forget)
'pipeline:subscribe',
'pipeline:unsubscribe',

// Listen channels (main → renderer, push events)
'pipeline:data',
'pipeline:status-change',
'pipeline:error',
'agent:build:pipeline-plan',
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/channels.ts
git commit -m "feat(ipc): add pipeline IPC channels"
```

---

### Task 2: Pipeline IPC Handlers

**Files:**
- Create: `src/main/ipc/pipeline.ts`
- Reference: `src/main/ipc/` (existing IPC handler patterns)

- [ ] **Step 1: Read existing IPC handler files to understand the registration pattern**

Read a few files in `src/main/ipc/` to see how handlers are structured and registered.

- [ ] **Step 2: Implement pipeline IPC handlers**

```typescript
// src/main/ipc/pipeline.ts
import { ipcMain, type WebContents } from 'electron'
import type { PipelineExecutor } from '../pipeline/executor'
import type { DataBus } from '../pipeline/data-bus'
import { readPipelinesJson } from '../pipeline/pipelines-json'

export function registerPipelineHandlers(
  executor: PipelineExecutor,
  bus: DataBus,
  projectDir: string,
) {
  ipcMain.handle('pipeline:list', async () => {
    const registry = await readPipelinesJson(projectDir)
    const statuses = executor.getAllStatuses()
    return registry.pipelines.map((entry) => ({
      ...entry,
      runtimeStatus: statuses.get(entry.pipelineId) ?? null,
    }))
  })

  ipcMain.handle('pipeline:get-data', async (_event, { pipelineId }: { pipelineId: string }) => {
    // Try cache first
    const cached = bus.getLatest(pipelineId)
    if (cached) return cached

    // For on-demand pipelines, trigger execution
    try {
      const output = await executor.execute(pipelineId, {})
      return output
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('pipeline:start', async (_event, { pipelineId }: { pipelineId: string }) => {
    await executor.startPipeline(pipelineId)
    return { success: true }
  })

  ipcMain.handle('pipeline:stop', async (_event, { pipelineId }: { pipelineId: string }) => {
    await executor.stopPipeline(pipelineId)
    return { success: true }
  })

  ipcMain.handle('pipeline:status', async (_event, { pipelineId }: { pipelineId: string }) => {
    return executor.getStatus(pipelineId)
  })

  // Subscription management — tracks which renderers are subscribed to which pipelines
  const subscriptions = new Map<string, Map<string, () => void>>()

  ipcMain.on('pipeline:subscribe', (event, { pipelineId }: { pipelineId: string }) => {
    const sender = event.sender
    const senderId = String(sender.id)

    if (!subscriptions.has(senderId)) {
      subscriptions.set(senderId, new Map())
    }

    // Avoid duplicate subscriptions
    if (subscriptions.get(senderId)!.has(pipelineId)) return

    const unsub = bus.subscribe(pipelineId, (data) => {
      if (!sender.isDestroyed()) {
        sender.send('pipeline:data', { pipelineId, data })
      }
    })

    subscriptions.get(senderId)!.set(pipelineId, unsub)

    // Send latest data immediately if available
    const latest = bus.getLatest(pipelineId)
    if (latest && !sender.isDestroyed()) {
      sender.send('pipeline:data', { pipelineId, data: latest })
    }
  })

  ipcMain.on('pipeline:unsubscribe', (event, { pipelineId }: { pipelineId: string }) => {
    const senderId = String(event.sender.id)
    const senderSubs = subscriptions.get(senderId)
    if (senderSubs) {
      const unsub = senderSubs.get(pipelineId)
      if (unsub) {
        unsub()
        senderSubs.delete(pipelineId)
      }
    }
  })
}
```

Note: Adapt the handler registration pattern to match how existing IPC handlers are set up in the project. If they use a different pattern (e.g., a handler registry object), follow that.

- [ ] **Step 3: Register handlers in main process startup**

Find where IPC handlers are registered (likely `src/main/ipc/index.ts` or main entry) and add:

```typescript
import { registerPipelineHandlers } from './pipeline'
// ... after executor and bus are initialized:
registerPipelineHandlers(executor, bus, projectDir)
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/pipeline.ts
git commit -m "feat(ipc): add pipeline IPC handlers"
```

---

### Task 3: Extend Orchestrator Types

**Files:**
- Modify: `src/main/agent/orchestrator/types.ts`

- [ ] **Step 1: Read current orchestrator types**

Read: `src/main/agent/orchestrator/types.ts`

- [ ] **Step 2: Add pipeline plan types**

Add these types alongside the existing `ComponentPlan`:

```typescript
export interface PipelinePlan {
  pipelineId: string
  requirements: string
  tasks: BuildTask[]
  blueprintMatch: BlueprintMatch | null
}

export interface WiringPlan {
  componentId: string
  pipelineId: string
  mappings: Record<string, string>
}

// Extend the existing BuildPlan (or ComponentPlan container) to include:
export interface BuildPlan {
  components: ComponentPlan[]
  pipelines: PipelinePlan[]
  wiring: WiringPlan[]
}
```

Note: The exact type names and structure depend on what already exists. Read the file first, then add pipeline fields to the existing plan structure without breaking existing component flow.

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/orchestrator/types.ts
git commit -m "feat(orchestrator): add pipeline plan types to BuildPlan"
```

---

### Task 4: Update Orchestrator Phases for Pipelines

**Files:**
- Modify: `src/main/agent/orchestrator/index.ts`
- Modify: `src/main/agent/orchestrator/sub-agent.ts`

- [ ] **Step 1: Read current orchestrator implementation**

Read: `src/main/agent/orchestrator/index.ts` and `src/main/agent/orchestrator/sub-agent.ts`

- [ ] **Step 2: Update the `search` phase**

In the search phase, add pipeline blueprint search alongside component search:

```typescript
// In the search phase handler:
// After component search, also search for pipeline blueprints
if (needsExternalData) {
  const pipelineResults = await tools.searchPipelineBlueprints.call({
    query: pipelineSearchQuery,
    limit: 5,
  })
  // Store pipeline search results in orchestrator context
}
```

- [ ] **Step 3: Update the `plan` phase**

Extend the plan phase prompt to generate `PipelinePlan[]` and `WiringPlan[]` alongside component plans. The LLM should output a unified plan with both entities.

Add to the structured output schema:
```typescript
pipelines: z.array(z.object({
  pipelineId: z.string(),
  requirements: z.string(),
  tasks: z.array(z.object({
    file: z.string(),
    assignment: z.string(),
    blueprint: z.string().nullable(),
  })),
})),
wiring: z.array(z.object({
  componentId: z.string(),
  pipelineId: z.string(),
  mappings: z.record(z.string()),
})),
```

- [ ] **Step 4: Update the `dispatch` phase**

In `sub-agent.ts`, add pipeline sub-agent dispatch alongside component sub-agents:

```typescript
// After dispatching component build agents:
const pipelineAgents = plan.pipelines.map((pipelinePlan) =>
  spawnPipelineBuildAgent(ctx, pipelinePlan)
)

// Run all agents in parallel
const [componentResults, pipelineResults] = await Promise.all([
  Promise.all(componentAgents),
  Promise.all(pipelineAgents),
])
```

The pipeline build agent system prompt should include the `PIPELINE_INTERFACE_SPEC` fragment from `fragments.ts` and the pipeline-specific build instructions.

- [ ] **Step 5: Update the `assemble` phase**

After assembling component results, also assemble pipeline results:
- Validate pipeline code compiles
- Run `dryRunPipeline` for each pipeline
- Validate wiring (component manifest references valid pipeline IDs)

- [ ] **Step 6: Update the `ship` phase**

After writing components, also write pipelines:
```typescript
// For each pipeline in the plan:
await tools.writePipeline.call({
  pipelineId: plan.pipelineId,
  files: assembledFiles,
  manifest: assembledManifest,
}, { projectDir })
```

- [ ] **Step 7: Emit pipeline plan event to renderer**

In the plan phase, after building the plan, send it to the renderer:
```typescript
sender.send('agent:build:pipeline-plan', { pipelines: plan.pipelines, wiring: plan.wiring })
```

- [ ] **Step 8: Commit**

```bash
git add src/main/agent/orchestrator/
git commit -m "feat(orchestrator): integrate pipeline planning, dispatch, and shipping"
```

---

### Task 5: Update Router for Pipeline-Wirer Skill

**Files:**
- Modify: `src/main/agent/router.ts`

- [ ] **Step 1: Read current router.ts**

- [ ] **Step 2: Add pipeline-wirer routing**

Add `'pipeline-wirer'` to the possible skill values in `RouteResult`. Add intent patterns that trigger it:

```typescript
// Pipeline-wirer keywords (routes to skill, not orchestrator):
// "connect pipeline", "wire pipeline", "link pipeline to", "use pipeline in"
// These indicate the user wants to wire an EXISTING pipeline to an EXISTING component.
```

Note: Most pipeline-related requests should still route to the orchestrator (which handles building new pipelines). The pipeline-wirer skill is only for connecting existing ones.

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/router.ts
git commit -m "feat(router): add pipeline-wirer skill routing"
```

---

### Task 6: Extend Component Bridge with Pipeline Methods

**Files:**
- Modify: `src/renderer/sandbox/DynamicComponent.tsx`

- [ ] **Step 1: Read current DynamicComponent.tsx to understand bridge injection**

- [ ] **Step 2: Add pipeline methods to the bridge**

The bridge object that components receive needs two new methods. Add to the bridge construction:

```typescript
pipeline: async (pipelineId: string) => {
  return window.electron.invoke('pipeline:get-data', { pipelineId })
},

pipelineSubscribe: (pipelineId: string, callback: (data: any) => void) => {
  window.electron.send('pipeline:subscribe', { pipelineId })

  const handler = (_event: any, msg: { pipelineId: string; data: any }) => {
    if (msg.pipelineId === pipelineId) {
      callback(msg.data)
    }
  }

  window.electron.on('pipeline:data', handler)

  return () => {
    window.electron.send('pipeline:unsubscribe', { pipelineId })
    window.electron.off('pipeline:data', handler)
  }
},
```

Note: Adapt to the exact bridge construction pattern used in the file. The bridge may be built differently (e.g., via contextBridge, or via a module injected into the eval scope).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sandbox/DynamicComponent.tsx
git commit -m "feat(bridge): add pipeline and pipelineSubscribe to component bridge"
```

---

### Task 7: Pipeline Store (Zustand)

**Files:**
- Create: `src/renderer/store/pipelineStore.ts`
- Reference: `src/renderer/store/canvasStore.ts` (mirror pattern)

- [ ] **Step 1: Read canvasStore.ts to understand Zustand pattern**

- [ ] **Step 2: Implement pipelineStore**

```typescript
// src/renderer/store/pipelineStore.ts
import { create } from 'zustand'

interface PipelineEntry {
  pipelineId: string
  status: 'active' | 'inactive' | 'error'
  lastRun?: number
  error?: string
  connectedComponents: string[]
  runtimeStatus?: {
    state: string
    lastError?: string
    uptimeMs?: number
  } | null
}

interface PipelineState {
  pipelines: PipelineEntry[]

  hydrate: (pipelines: PipelineEntry[]) => void
  addPipeline: (entry: PipelineEntry) => void
  removePipeline: (pipelineId: string) => void
  updatePipeline: (pipelineId: string, patch: Partial<PipelineEntry>) => void
  updateRuntimeStatus: (pipelineId: string, status: PipelineEntry['runtimeStatus']) => void
}

export const usePipelineStore = create<PipelineState>((set) => ({
  pipelines: [],

  hydrate: (pipelines) => set({ pipelines }),

  addPipeline: (entry) =>
    set((state) => ({
      pipelines: [...state.pipelines.filter((p) => p.pipelineId !== entry.pipelineId), entry],
    })),

  removePipeline: (pipelineId) =>
    set((state) => ({
      pipelines: state.pipelines.filter((p) => p.pipelineId !== pipelineId),
    })),

  updatePipeline: (pipelineId, patch) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.pipelineId === pipelineId ? { ...p, ...patch } : p,
      ),
    })),

  updateRuntimeStatus: (pipelineId, status) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.pipelineId === pipelineId ? { ...p, runtimeStatus: status } : p,
      ),
    })),
}))
```

- [ ] **Step 3: Hydrate on app startup**

Find where `canvas:load` is called at startup and add pipeline hydration nearby:

```typescript
const pipelines = await window.electron.invoke('pipeline:list')
usePipelineStore.getState().hydrate(pipelines)
```

- [ ] **Step 4: Listen for runtime status changes**

Add a listener for `pipeline:status-change` events:

```typescript
window.electron.on('pipeline:status-change', (_event, { pipelineId, status }) => {
  usePipelineStore.getState().updateRuntimeStatus(pipelineId, status)
})
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/pipelineStore.ts
git commit -m "feat(renderer): add pipelineStore with hydration"
```

---

### Task 8: Pipeline Panel UI

**Files:**
- Create: `src/renderer/pipeline/PipelinePanel.tsx`

- [ ] **Step 1: Implement PipelinePanel**

A minimal but functional panel showing all pipelines with status, connected components, and start/stop controls:

```tsx
// src/renderer/pipeline/PipelinePanel.tsx
import React from 'react'
import { usePipelineStore } from '../store/pipelineStore'

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400',
  running: 'text-green-400',
  polling: 'text-green-400',
  streaming: 'text-blue-400',
  inactive: 'text-muted',
  stopped: 'text-muted',
  error: 'text-red-400',
  idle: 'text-yellow-400',
}

export function PipelinePanel() {
  const pipelines = usePipelineStore((s) => s.pipelines)

  const handleStart = async (pipelineId: string) => {
    await window.electron.invoke('pipeline:start', { pipelineId })
  }

  const handleStop = async (pipelineId: string) => {
    await window.electron.invoke('pipeline:stop', { pipelineId })
  }

  if (pipelines.length === 0) {
    return (
      <div className="p-4 text-muted text-sm">
        No data pipelines yet. The agent will create them when your components need external data.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-text font-medium text-sm">Data Pipelines</h3>
      {pipelines.map((p) => {
        const runtimeState = p.runtimeStatus?.state ?? p.status
        const colorClass = STATUS_COLORS[runtimeState] ?? 'text-muted'

        return (
          <div
            key={p.pipelineId}
            className="bg-surface rounded-lg p-3 border border-border"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-text text-sm font-medium">{p.pipelineId}</span>
                <span className={`ml-2 text-xs ${colorClass}`}>{runtimeState}</span>
              </div>
              <div className="flex gap-1">
                {runtimeState === 'stopped' || runtimeState === 'inactive' ? (
                  <button
                    onClick={() => handleStart(p.pipelineId)}
                    className="text-xs px-2 py-1 rounded bg-primary text-white hover:opacity-80"
                  >
                    Start
                  </button>
                ) : runtimeState !== 'error' ? (
                  <button
                    onClick={() => handleStop(p.pipelineId)}
                    className="text-xs px-2 py-1 rounded bg-surface border border-border text-muted hover:text-text"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleStart(p.pipelineId)}
                    className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>

            {p.connectedComponents.length > 0 && (
              <div className="mt-1 text-xs text-muted">
                Connected: {p.connectedComponents.join(', ')}
              </div>
            )}

            {p.runtimeStatus?.lastError && (
              <div className="mt-1 text-xs text-red-400 truncate">
                {p.runtimeStatus.lastError}
              </div>
            )}

            {p.lastRun && (
              <div className="mt-1 text-xs text-muted">
                Last run: {new Date(p.lastRun).toLocaleTimeString()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Wire PipelinePanel into the app layout**

Find the sidebar or settings panel where this should be rendered and add:

```tsx
import { PipelinePanel } from '../pipeline/PipelinePanel'
// ... in the sidebar/panel:
<PipelinePanel />
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pipeline/PipelinePanel.tsx
git commit -m "feat(ui): add PipelinePanel component"
```

---

### Task 9: Agent Types Update

**Files:**
- Modify: `src/shared/agentTypes.ts`

- [ ] **Step 1: Read current agentTypes.ts**

- [ ] **Step 2: Add pipeline-related message types**

Add types for pipeline build events alongside existing component build events:

```typescript
export interface PipelineBuildPlanEvent {
  type: 'pipeline-plan'
  pipelines: Array<{
    pipelineId: string
    requirements: string
  }>
  wiring: Array<{
    componentId: string
    pipelineId: string
  }>
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/agentTypes.ts
git commit -m "feat(types): add pipeline build event types"
```

---

### Task 10: Run Full Test Suite & Typecheck

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (no regressions)

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues from pipeline feature"
```
