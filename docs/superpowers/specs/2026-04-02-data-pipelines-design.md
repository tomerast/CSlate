# Data Pipelines Design Spec

**Date:** 2026-04-02
**Status:** Draft
**Scope:** CSlate (Electron client) + CSlate-server (backend)

## Overview

Data pipelines are a first-class entity alongside components in CSlate. While components handle UI rendering, pipelines handle external data — fetching, transforming, aggregating, and delivering data from external APIs to components. The agent builds pipelines the same way it builds components: searches the catalog, generates code, validates, and publishes.

**Core principle:** Any external data source = pipeline, always. No inline API logic in component code. This gives every component production-grade data separation, reusability, and publishability from day one.

### Example

User says: "Build me a stock portfolio tracker."

The agent:
1. Plans a `yahoo_stocks` pipeline (fetches real-time prices from Yahoo Finance API)
2. Plans a `portfolio_tracker` component (displays portfolio with P&L calculations)
3. Searches CSlate-server for existing pipeline/component blueprints
4. Builds both in parallel via sub-agents
5. Wires the component to the pipeline via the bridge API
6. Dry-runs the pipeline to verify data flows
7. Shows user the component with live data for approval
8. Publishes both to CSlate-server

---

## 1. Pipeline Entity & File Structure

### Directory Layout

```
{projectDir}/
├── pipelines.json                        # Registry of all pipelines
├── pipelines/
│   └── yahoo_stocks/
│       ├── manifest.json                 # Contract: secrets, strategy, output schema
│       ├── pipeline.ts                   # Main entry — implements DataPipeline interface
│       ├── transform.ts                  # Optional: data transformation logic
│       ├── types.ts                      # Input params & output shape
│       ├── context.md                    # What this pipeline does and why
│       └── compiled/
│           └── worker-bundle.js          # esbuild-compiled bundle for Worker Thread
```

Pipeline IDs follow the same convention as components: `^[a-z0-9][a-z0-9_-]*$`.

### DataPipeline Interface

Every pipeline's `pipeline.ts` must default-export a class implementing this interface:

```typescript
interface DataPipeline {
  /**
   * One-time fetch. Called for on-demand strategy, or on each poll tick.
   * Receives resolved params (user config + defaults from manifest).
   */
  execute(params: Record<string, unknown>): Promise<PipelineOutput>

  /**
   * Optional: open a persistent connection (WebSocket, SSE, etc.)
   * Called once for streaming strategy. Push data via callback.
   * Returns a teardown function.
   */
  stream?(
    params: Record<string, unknown>,
    push: (data: PipelineOutput) => void
  ): Promise<() => void>

  /**
   * Optional: cleanup resources (close connections, clear state).
   * Called when pipeline is stopped or app quits.
   */
  dispose?(): Promise<void>
}

interface PipelineOutput {
  data: unknown
  metadata: {
    fetchedAt: number          // Unix timestamp ms
    source: string             // Human-readable origin, e.g. "Yahoo Finance API"
    cached: boolean            // Was this served from cache?
  }
}
```

### Pipeline Manifest Schema

```typescript
interface PipelineManifest {
  name: string                           // Human-readable name
  description: string                    // What this pipeline does
  tags: string[]                         // For search/discovery

  // What secrets it needs (resolved from encrypted config store at runtime)
  secrets: Record<string, {
    description: string
    required: boolean
  }>

  // Runtime parameters (user-configurable)
  params: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object'
    description: string
    required: boolean
    default?: unknown
  }>

  // What it produces (JSON Schema-style description)
  outputSchema: Record<string, {
    type: string
    description: string
  }>

  // How it runs
  strategy: {
    type: 'on-demand' | 'polling' | 'streaming'
    intervalMs?: number                  // For polling (e.g., 30000 = 30s)
    cacheTtlMs?: number                  // Cache TTL — skip fetch if data is fresh
  }

  // Package metadata
  files: string[]                        // Files in this pipeline package
  version?: string
}
```

### pipelines.json (Registry)

```typescript
interface PipelinesJson {
  pipelines: PipelineEntry[]
}

interface PipelineEntry {
  pipelineId: string
  status: 'active' | 'inactive' | 'error'
  lastRun?: number                       // Timestamp of last successful execution
  error?: string                         // Last error message if status is 'error'
  connectedComponents: string[]          // Component IDs consuming this pipeline
}
```

---

## 2. Runtime — Pipeline Executor & Worker Isolation

### Pipeline Executor

A singleton service in the Electron main process (`src/main/pipeline/executor.ts`) that manages all pipeline lifecycles.

```typescript
class PipelineExecutor {
  constructor(projectDir: string, dataBus: DataBus, configStore: ConfigStore)

  // Lifecycle
  startPipeline(pipelineId: string, params?: Record<string, unknown>): Promise<void>
  stopPipeline(pipelineId: string): Promise<void>
  restartPipeline(pipelineId: string): Promise<void>

  // Query
  getStatus(pipelineId: string): PipelineStatus
  getAllStatuses(): Map<string, PipelineStatus>

  // Batch lifecycle (app startup/shutdown)
  startAll(): Promise<void>              // Start all 'active' pipelines from pipelines.json
  stopAll(): Promise<void>               // Graceful shutdown of all workers

  // Compilation
  compilePipeline(pipelineId: string): Promise<string>  // Returns path to worker-bundle.js
}

interface PipelineStatus {
  pipelineId: string
  state: 'idle' | 'running' | 'polling' | 'streaming' | 'error' | 'stopped'
  lastOutput?: PipelineOutput
  lastError?: string
  uptimeMs?: number
  nextPollAt?: number                    // For polling pipelines
}
```

### Worker Thread Isolation

Each active pipeline runs in its own Node.js Worker Thread for crash isolation:

```
Main Process
├── PipelineExecutor (singleton)
│   ├── Worker Thread: yahoo_stocks      ← compiled/worker-bundle.js
│   ├── Worker Thread: weather_feed      ← compiled/worker-bundle.js
│   └── Worker Thread: portfolio_calc    ← compiled/worker-bundle.js
└── DataBus
    ├── yahoo_stocks → [ComponentA, ComponentB]
    └── weather_feed → [ComponentC]
```

**Worker lifecycle:**

1. Executor compiles `pipeline.ts` → `compiled/worker-bundle.js` via esbuild (node platform, CJS format)
2. Spawns `new Worker(workerShim.js)` — a thin shim that loads the bundle and exposes the `DataPipeline` interface via `postMessage`
3. Executor sends commands via `postMessage`:
   - `{ type: 'execute', params }` — run `execute()` once
   - `{ type: 'stream', params }` — start `stream()` persistent connection
   - `{ type: 'dispose' }` — clean up and exit
4. Worker responds:
   - `{ type: 'data', output: PipelineOutput }` — data ready
   - `{ type: 'error', error: string }` — execution failed
   - `{ type: 'ready' }` — worker initialized successfully
5. On crash (`worker.on('error')`) — executor sets status to `error`, updates `pipelines.json`, optionally retries

**Secret injection:**

Before spawning a worker, the executor resolves all declared secrets from the encrypted config store (`safeStorage`) and passes them as `workerData`. The worker shim exposes a `getSecret(name)` helper — pipeline code never touches the config store directly. Published pipelines on CSlate-server include secret *names* but never *values*.

**Resource management:**

- Executor monitors worker memory via periodic `worker.getHeapStatistics()` calls
- Workers exceeding a configurable threshold (default 256MB) are killed and restarted
- For polling pipelines: the executor manages the timer in the main thread, sending `execute` commands on each tick — workers don't run their own `setInterval` (prevents zombie timers on crash)
- On app quit: `stopAll()` sends `dispose` to each worker, waits up to 5s, then terminates

### Bundling for Workers

Extends existing esbuild infrastructure with node-targeted config:

```typescript
{
  entryPoints: ['pipeline.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',                     // Key difference from component bundles
  target: 'node18',
  external: [],                          // Bundle everything — worker is fully isolated
  write: true,
  outfile: 'compiled/worker-bundle.js'
}
```

### Caching Layer

Built into the executor, transparent to pipeline code:

- Before calling `execute()`, check if cached output exists and `Date.now() - fetchedAt < cacheTtlMs`
- Fresh → return cached output, skip worker call
- Stale → call worker, cache result, publish to DataBus
- Cache is in-memory (`Map`), lost on app restart — pipelines re-fetch on startup
- Cache is per-pipeline, keyed by `pipelineId`

---

## 3. State Bus & Component Integration

### DataBus

A pub/sub event system in the main process that decouples pipelines from components (`src/main/pipeline/data-bus.ts`):

```typescript
class DataBus {
  // Pipeline side — executor publishes here after each successful execution
  publish(pipelineId: string, data: PipelineOutput): void

  // Component side — bridge subscribes here
  subscribe(pipelineId: string, callback: (data: PipelineOutput) => void): () => void

  // Query latest value (for on-demand / late-joining components)
  getLatest(pipelineId: string): PipelineOutput | null

  // Wiring metadata
  getConsumers(pipelineId: string): string[]
  getProducersFor(componentId: string): string[]
}
```

Implemented as `EventEmitter` + `Map<string, PipelineOutput>` for latest values.

### Bridge API Extension

Components access pipeline data through two new bridge methods:

```typescript
// In component ui.tsx or logic.ts:

// One-time read of latest data (triggers execute for on-demand pipelines)
const stockData = await bridge.pipeline('yahoo_stocks')

// Subscribe to live updates (polling/streaming pipelines push automatically)
const unsub = bridge.pipelineSubscribe('yahoo_stocks', (data) => {
  setStockPrices(data.prices)
})
```

**`bridge.pipeline()` flow:**

1. Component calls `bridge.pipeline('yahoo_stocks')`
2. Renderer sends IPC `pipeline:get-data` → `{ pipelineId: 'yahoo_stocks' }`
3. Main process checks DataBus for cached latest data
4. If on-demand pipeline with no cached data → triggers worker `execute()`, waits for result
5. Returns `PipelineOutput` to component

**`bridge.pipelineSubscribe()` flow:**

1. Component calls `bridge.pipelineSubscribe('yahoo_stocks', callback)`
2. Renderer sends IPC `pipeline:subscribe` → `{ pipelineId }`
3. Main process registers DataBus listener, forwards data via `pipeline:data` listen channel
4. On unsubscribe → IPC `pipeline:unsubscribe`, cleanup listener

### Manifest-Level Wiring

Component manifests gain a `pipelines` field for agent reasoning:

```json
{
  "pipelines": {
    "stockData": {
      "pipelineId": "yahoo_stocks",
      "description": "Real-time stock prices for portfolio display",
      "mappings": {
        "prices": "yahoo_stocks.data.prices",
        "lastUpdated": "yahoo_stocks.metadata.fetchedAt"
      }
    }
  }
}
```

This is declarative metadata only. The runtime wiring happens through bridge calls in the component code. But it gives the agent a clear picture of what's connected to what, enabling:
- Auto-detection of missing pipelines
- Wiring suggestions when new components are added
- Dependency tracking for the pipeline panel UI

### Auto-Activation

When a component is loaded onto the canvas:
1. `canvas:load` inspects each component's `pipelines` manifest field
2. For each referenced pipeline not already running → executor starts it
3. If pipeline doesn't exist locally → surface to user: "Component X needs the yahoo_stocks pipeline, which isn't set up yet"
4. If pipeline exists but secrets are missing → prompt user to configure them

---

## 4. Agent Integration

### New Agent Tools

Located at `src/main/agent/tools/`, following the existing `CSTool` pattern:

| Tool | Read-only | Concurrent | Purpose |
|------|-----------|-----------|---------|
| `validatePipelineManifest` | Yes | Yes | Validate pipeline manifest against `PipelineManifest` Zod schema |
| `writePipeline` | No | No | Write pipeline files to disk, compile worker bundle, update `pipelines.json` |
| `dryRunPipeline` | No | No | Execute pipeline once in ephemeral worker, return sample output for verification |
| `readPipelineManifest` | Yes | Yes | Read existing pipeline's manifest from disk |
| `scanLocalPipelines` | Yes | Yes | Token-based local search across installed pipelines |
| `searchPipelineBlueprints` | Yes | Yes | Search CSlate-server for published pipeline templates |

**`writePipeline` flow** (mirrors `writeComponent`):

1. Path containment check via `safePath()` / `safeComponentId()`
2. Validate manifest against Zod schema
3. Write source files to `pipelines/{pipelineId}/`
4. Compile `pipeline.ts` → `compiled/worker-bundle.js` via esbuild (node platform)
5. Update `pipelines.json` with new entry (status: `inactive` until approved or needed)
6. Return `{ success, path, errors }`

**`dryRunPipeline` flow** (mirrors `renderComponent` preview):

1. Compile to temp worker bundle
2. Resolve secrets from config store
3. Spawn ephemeral worker, call `execute()` once with timeout (30s default)
4. Return `{ success, output, executionTimeMs, errors }`
5. Kill worker, clean up temp files

### Orchestrator Changes

The orchestrator's `plan` phase produces a unified build plan covering both entities:

```typescript
interface BuildPlan {
  components: ComponentPlan[]            // Existing
  pipelines: PipelinePlan[]              // New
  wiring: WiringPlan[]                   // New
}

interface PipelinePlan {
  pipelineId: string
  requirements: string                   // What data this pipeline provides
  tasks: BuildTask[]                     // Files to build
  blueprintMatch: BlueprintMatch | null  // Best match from CSlate-server
}

interface WiringPlan {
  componentId: string
  pipelineId: string
  mappings: Record<string, string>       // Component input → pipeline output path
}
```

**Phase-by-phase changes:**

| Phase | Change |
|-------|--------|
| **understand** | Detect external data needs from user request |
| **search** | Search both component AND pipeline blueprints on CSlate-server |
| **plan** | Produce unified `BuildPlan` with components, pipelines, and wiring |
| **dispatch** | Spawn pipeline sub-agents in parallel with component sub-agents. Pipeline sub-agents get a pipeline-specific system prompt with the `DataPipeline` interface, secret patterns, and API conventions. |
| **assemble** | Validate pipeline code. Run `dryRunPipeline` for each. Validate wiring between components and pipelines. |
| **validate** | Code review for both entities |
| **ship** | `writePipeline` + `writeComponent` + activate pipelines + apply wiring |

### Router Changes

Pipeline-specific routing additions to `router.ts`:

- New **`pipeline-wirer`** skill: connects existing pipelines to existing components. Triggered by "connect my weather pipeline to the dashboard", "wire the stock data to the portfolio component", etc.
- Keywords that reinforce orchestrator routing (already routed there, but help the `understand` phase): "data", "API", "fetch", "connect to", "get data from", "stream", "real-time", "live data"

### Agent Prompts

New prompt fragments in `src/main/agent/prompts/fragments.ts`:

- **Pipeline interface spec** — the `DataPipeline` interface, `PipelineOutput` type, and coding conventions
- **Pipeline sandbox rules** — what's allowed in pipeline code (full Node.js, `getSecret()` for credentials, no direct filesystem writes outside pipeline dir)
- **Pipeline-component wiring patterns** — how to use `bridge.pipeline()` and `bridge.pipelineSubscribe()` in component code

---

## 5. CSlate-Server Changes

### Pipeline Catalog

New `pipelines` collection/table alongside the existing components collection. Same indexing, search, and storage patterns.

### New API Endpoints

```
GET  /api/pipelines/search?q={query}&limit={limit}
     Search pipeline blueprints by name, description, tags.

POST /api/pipelines/upload
     Publish pipeline to catalog.
     Body: { name, description, tags, source: Record<string, string>, manifest: PipelineManifest }

GET  /api/pipelines/{pipelineId}/source
     Fetch pipeline source files and manifest.

GET  /api/pipelines/{pipelineId}
     Get pipeline metadata (name, description, tags, output schema, strategy).

GET  /api/search?q={query}&type=all|component|pipeline
     Combined search across both entity types.
```

### Server-Side Validation

On upload, the server validates:
- Manifest conforms to `PipelineManifest` Zod schema (from `@cslate/shared`)
- Required files present (`pipeline.ts`, `manifest.json`)
- Secret *names* declared but no secret *values* present in source code
- Output schema is well-formed
- Security scan: no `eval()`, `child_process.exec()`, `fs.writeFileSync()`, or other dangerous patterns (same approach as component scanning)

### CSlateServerClient Changes

Extend `src/main/server/CSlateServerClient.ts`:

```typescript
class CSlateServerClient {
  // Existing component methods unchanged

  // New — pipeline catalog
  async searchPipelines(query: string, limit: number): Promise<{
    results: PipelineCatalogEntry[]
    total: number
    error?: string
  }>

  async publishPipeline(payload: {
    name: string
    description: string
    tags: string[]
    source: Record<string, string>
    manifest: PipelineManifest
  }): Promise<{ id?: string; status?: string; error?: string }>

  async fetchPipelineSource(pipelineId: string): Promise<{
    source?: Record<string, string>
    manifest?: PipelineManifest
    error?: string
  }>

  // New — combined search
  async searchAll(query: string, limit: number): Promise<{
    components: ComponentCatalogEntry[]
    pipelines: PipelineCatalogEntry[]
  }>
}
```

### @cslate/shared Updates

The shared package gains pipeline types:
- `PipelineManifest` — Zod schema + TypeScript type
- `PipelineOutput` — output contract type
- `validatePipelinePackage()` — validates pipeline package structure (mirror of `validateComponentPackage()`)
- Exported for use by both CSlate client and CSlate-server

---

## 6. IPC Channels & Renderer Integration

### New IPC Channels

Added to `src/preload/channels.ts`:

**Invoke channels (renderer → main, with reply):**
```
pipeline:list              — List all pipelines with status
pipeline:get-data          — Get latest data for a pipeline (triggers execute if on-demand)
pipeline:start             — Manually start/activate a pipeline
pipeline:stop              — Manually stop a pipeline
pipeline:status            — Get status of a specific pipeline
```

**Send channels (renderer → main):**
```
pipeline:subscribe         — Subscribe to live pipeline data updates
pipeline:unsubscribe       — Unsubscribe from pipeline data
```

**Listen channels (main → renderer, events):**
```
pipeline:data              — Push pipeline data to subscribed components
pipeline:status-change     — Pipeline state changed (running/error/stopped)
pipeline:error             — Pipeline runtime error notification
```

**Agent orchestrator events (main → renderer):**
```
agent:build:pipeline-plan  — Pipeline plan created (sent alongside agent:build:plan)
```

### Renderer State — pipelineStore

New Zustand store at `src/renderer/store/pipelineStore.ts`:

```typescript
interface PipelineState {
  pipelines: PipelineEntry[]
  statuses: Map<string, PipelineStatus>

  hydrate(pipelines: PipelineEntry[]): void
  updateStatus(pipelineId: string, status: PipelineStatus): void
  addPipeline(entry: PipelineEntry): void
  removePipeline(pipelineId: string): void
}
```

Hydrated on app startup via `pipeline:list` IPC call. Updated in real-time via `pipeline:status-change` listener.

### UI Surface

Pipelines are not visual canvas entities but need user visibility:

- **Pipeline panel** — Accessible from sidebar. Lists all pipelines with status indicators (running/stopped/error), connected components, last run timestamp, refresh strategy.
- **Component data indicators** — Components connected to pipelines show a small status badge (green = active data, yellow = stale, red = pipeline error) so the user sees data health at a glance.
- **Build progress** — During orchestrator builds, pipeline build progress appears alongside component progress in existing build card UI.
- **Secret configuration** — When a pipeline requires unconfigured secrets, the UI prompts the user to provide them via the settings panel.

---

## 7. Pipeline Lifecycle Summary

```
User request ("build me a stock portfolio tracker")
    │
    ▼
Orchestrator: understand
    │ Detects: needs stock price data from external API
    ▼
Orchestrator: search
    │ Queries CSlate-server for both component AND pipeline blueprints
    ▼
Orchestrator: plan
    │ Produces BuildPlan:
    │   pipelines: [{ pipelineId: "yahoo_stocks", ... }]
    │   components: [{ componentId: "portfolio_tracker", ... }]
    │   wiring: [{ componentId: "portfolio_tracker", pipelineId: "yahoo_stocks", ... }]
    ▼
Orchestrator: dispatch
    │ Spawns sub-agents in parallel:
    │   - Pipeline agent → builds yahoo_stocks pipeline
    │   - Component agent → builds portfolio_tracker component
    ▼
Orchestrator: assemble
    │ Validates both artifacts
    │ Runs dryRunPipeline → verifies data flows
    │ Validates wiring (component manifest references pipeline correctly)
    ▼
Orchestrator: validate
    │ Code review for both entities
    ▼
Orchestrator: ship
    │ writePipeline → persists pipeline to disk, compiles worker bundle
    │ writeComponent → persists component to disk, bundles UI
    │ Activates pipeline (executor starts worker)
    │ Component renders with live data
    ▼
User reviews → approves → publish both to CSlate-server
```

---

## 8. File Map (New & Modified)

### New Files — CSlate Client

```
src/main/pipeline/
  executor.ts                            # PipelineExecutor singleton
  data-bus.ts                            # DataBus pub/sub
  worker-shim.js                         # Worker Thread shim (loads bundle, postMessage interface)
  compiler.ts                            # esbuild pipeline compilation (node platform)
  types.ts                               # PipelineStatus, PipelineEntry, etc.

src/main/agent/tools/
  validatePipelineManifest.ts            # Validate manifest against Zod schema
  writePipeline.ts                       # Write pipeline to disk + compile + register
  dryRunPipeline.ts                      # Ephemeral execution for verification
  readPipelineManifest.ts                # Read existing pipeline manifest
  scanLocalPipelines.ts                  # Local pipeline search
  searchPipelineBlueprints.ts            # CSlate-server pipeline search

src/main/agent/skills/
  pipeline-wirer.ts                      # Wire existing pipeline to existing component

src/renderer/store/
  pipelineStore.ts                       # Zustand store for pipeline state

src/renderer/pipeline/
  PipelinePanel.tsx                      # Pipeline management UI panel
```

### Modified Files — CSlate Client

```
src/preload/channels.ts                  # Add pipeline IPC channels
src/main/agent/tools/index.ts            # Register pipeline tools in buildToolSet
src/main/agent/orchestrator/types.ts     # BuildPlan gains pipelines + wiring
src/main/agent/orchestrator/index.ts     # Plan/dispatch/assemble phases handle pipelines
src/main/agent/orchestrator/sub-agent.ts # Pipeline sub-agent dispatch
src/main/agent/router.ts                 # Pipeline-wirer skill routing
src/main/agent/skills/index.ts           # Register pipeline-wirer skill
src/main/agent/prompts/fragments.ts      # Pipeline prompt fragments
src/main/server/CSlateServerClient.ts    # Pipeline search/publish/fetch methods
src/main/ipc/pipeline.ts (new)           # Pipeline IPC handlers
src/renderer/sandbox/DynamicComponent.tsx # Bridge gains pipeline/pipelineSubscribe methods
src/shared/agentTypes.ts                 # Pipeline-related agent message types
```

### New/Modified — @cslate/shared

```
src/pipeline-manifest.ts (new)           # PipelineManifest Zod schema + types
src/pipeline-validation.ts (new)         # validatePipelinePackage()
src/index.ts                             # Export pipeline types
```

### New/Modified — CSlate-Server

```
# New endpoints
routes/pipelines/search.ts               # GET /api/pipelines/search
routes/pipelines/upload.ts               # POST /api/pipelines/upload
routes/pipelines/source.ts               # GET /api/pipelines/:id/source
routes/pipelines/metadata.ts             # GET /api/pipelines/:id
routes/search.ts                         # GET /api/search (combined)

# New
models/pipeline.ts                       # Pipeline DB model/schema
services/pipeline-catalog.ts             # Catalog logic (index, search, validate)
services/pipeline-security-scan.ts       # Security validation on upload

# Modified
models/index.ts                          # Register pipeline model
routes/index.ts                          # Mount pipeline routes
```
