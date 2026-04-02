# Data Pipelines — Review & Merge Guide

**Date:** 2026-04-02
**Purpose:** Deep code review of all 6 worktree branches, resolve conflicts, merge into main across 2 repos.

---

## Design Spec

Read first: `docs/superpowers/specs/2026-04-02-data-pipelines-design.md`

Implementation plans (for reference):
- `docs/superpowers/plans/2026-04-02-data-pipelines-cslate-1-runtime.md`
- `docs/superpowers/plans/2026-04-02-data-pipelines-cslate-2-agent-tools.md`
- `docs/superpowers/plans/2026-04-02-data-pipelines-cslate-3-integration.md`
- `docs/superpowers/plans/2026-04-02-data-pipelines-server-1-data-layer.md`
- `docs/superpowers/plans/2026-04-02-data-pipelines-server-2-pipeline.md`
- `docs/superpowers/plans/2026-04-02-data-pipelines-server-3-api.md`

---

## Repo 1: CSlate (Electron Client)

**Main branch:** `main` at `25561a0`
**Repo path:** `/Users/tomerast/Projects/CSlate`

### Branch A: `feature/data-pipelines-runtime` (7 commits)

**What it does:** Pipeline runtime core — types, data bus, compiler, worker thread shim, executor, pipelines.json utilities.

**Files created:**
- `src/main/pipeline/types.ts` — Zod schemas: PipelineManifestSchema, PipelinePackageSchema, WorkerCommand/WorkerResponse protocol, DataPipeline interface
- `src/main/pipeline/data-bus.ts` — EventEmitter-based pub/sub (subscribe/publish/unsubscribe)
- `src/main/pipeline/compiler.ts` — esbuild bundling for pipeline.ts → worker-bundle.js
- `src/main/pipeline/worker-shim.js` — Worker Thread entry: receives commands via parentPort, executes/streams/disposes
- `src/main/pipeline/executor.ts` — PipelineExecutor: manages worker lifecycle, polling timers, caching, secret injection
- `src/main/pipeline/pipelines-json.ts` — Read/write/add/remove pipelines registry
- `src/main/pipeline/index.ts` — Barrel export
- `src/main/pipeline/__tests__/` — Tests for compiler, data-bus, executor, worker-shim

**Files modified:**
- `src/main/server/CSlateServerClient.ts` — Deleted 112 lines (likely reverted to older version accidentally)

**Review checklist:**
- [ ] Verify `types.ts` Zod schemas match the design spec (PipelineManifest fields, strategy enum, secret declarations)
- [ ] Verify `worker-shim.js` properly handles execute/stream/dispose commands and error serialization
- [ ] Verify `executor.ts` correctly manages Worker Thread lifecycle (spawn, kill, timeout)
- [ ] Verify `executor.ts` polling timer implementation (start/stop/interval changes)
- [ ] Verify `executor.ts` secret injection from config store via workerData
- [ ] Verify `data-bus.ts` correctly decouples pipelines from components
- [ ] Verify `compiler.ts` externalizes dependencies correctly (like component compiler)
- [ ] Verify `pipelines-json.ts` uses `safePath()` for path safety
- [ ] Check all tests pass: `cd .worktrees/data-pipelines-runtime && npm test`
- [ ] Check `CSlateServerClient.ts` — the 112-line deletion is likely a revert bug; compare with main and restore

---

### Branch B: `feature/data-pipelines-agent-tools` (11 commits)

**What it does:** 6 agent tools + pipeline-wirer skill + prompt fragments + tool registration.

**Files created:**
- `src/main/agent/tools/validatePipelineManifest.ts` — Validates manifest.json against PipelineManifestSchema
- `src/main/agent/tools/readPipelineManifest.ts` — Reads and parses a pipeline's manifest.json
- `src/main/agent/tools/writePipeline.ts` — Writes pipeline files (manifest, pipeline.ts, types.ts, etc.) + compiles
- `src/main/agent/tools/dryRunPipeline.ts` — Executes a pipeline once and returns output for verification
- `src/main/agent/tools/scanLocalPipelines.ts` — Lists all pipelines in project directory
- `src/main/agent/tools/searchPipelineBlueprints.ts` — Searches CSlate-server pipeline catalog
- `src/main/agent/tools/__tests__/` — Tests for each tool
- `src/main/agent/skills/pipeline-wirer.ts` — Skill that wires components to pipelines via bridge API
- `src/main/pipeline/compiler.ts` — Duplicate of runtime branch (same content, same hash)
- `src/main/pipeline/pipelines-json.ts` — Different content from runtime branch (hash mismatch!)
- `src/main/pipeline/types.ts` — Duplicate of runtime branch (same content)
- `src/main/pipeline/worker-shim.js` — Duplicate of runtime branch (same content)

**Files modified:**
- `src/main/agent/tools/index.ts` — Registers 6 new pipeline tools in buildToolSet
- `src/main/agent/prompts/fragments.ts` — Pipeline-related prompt fragments
- `src/main/agent/skills/index.ts` — Registers pipeline-wirer skill
- `src/main/agent/skills/__tests__/skills.test.ts` — Updated to include pipeline-wirer
- `src/main/agent/__tests__/skill-registry.test.ts` — Updated assertions
- `src/main/server/CSlateServerClient.ts` — Different from both main and runtime branch (hash differs from runtime)

**Review checklist:**
- [ ] Verify all 6 tools follow the `create*Tool(context)` factory pattern per CLAUDE.md
- [ ] Verify `writePipeline.ts` creates proper directory structure matching design spec
- [ ] Verify `writePipeline.ts` calls compiler after writing source files
- [ ] Verify `dryRunPipeline.ts` uses PipelineExecutor properly (doesn't leak worker threads)
- [ ] Verify `searchPipelineBlueprints.ts` calls correct CSlateServerClient methods
- [ ] Verify `pipeline-wirer.ts` skill correctly wires bridge.pipeline() calls into component code
- [ ] Verify prompt fragments accurately describe pipeline capabilities to the LLM
- [ ] Check `pipelines-json.ts` diff vs runtime branch — reconcile the two versions
- [ ] Check `CSlateServerClient.ts` diff vs main — likely added pipeline search/publish methods; verify API contract
- [ ] Check all tests pass: `cd .worktrees/data-pipelines-agent-tools && npm test`

---

### Branch C: `feature/data-pipelines-integration` (9 commits)

**What it does:** Orchestrator integration, IPC layer, bridge extension, renderer store, UI panel.

**Files created:**
- `src/main/ipc/pipeline.ts` — IPC handlers for pipeline:* channels
- `src/main/agent/orchestrator/types.ts` — PipelineBuildPlan types added to BuildPlan
- `src/renderer/store/pipelineStore.ts` — Zustand store for pipeline state
- `src/renderer/pipeline/PipelinePanel.tsx` — Pipeline management UI panel
- `src/renderer/layout/AppLayout.tsx` — Layout component (may be new or modified)

**Files modified:**
- `src/preload/channels.ts` — 17 new pipeline IPC channels added
- `src/main/agent/orchestrator/index.ts` — Pipeline planning, dispatch, shipping integrated into orchestrator
- `src/main/agent/orchestrator/sub-agent.ts` — Sub-agent spawning for pipeline builds
- `src/main/agent/router.ts` — Pipeline-wirer skill routing
- `src/main/index.ts` — Pipeline IPC handler registration
- `src/renderer/chat/ChatPanel.tsx` — Pipeline-related chat UI additions
- `src/renderer/sandbox/DynamicComponent.tsx` — Bridge extension: bridge.pipeline() and bridge.pipelineSubscribe()
- `src/shared/agentTypes.ts` — Pipeline build event types
- `src/main/server/CSlateServerClient.ts` — Same deletion issue as runtime branch

**Review checklist:**
- [ ] Verify `channels.ts` new channels match the IPC handlers in `pipeline.ts`
- [ ] Verify `pipeline.ts` IPC handlers properly call PipelineExecutor methods
- [ ] Verify orchestrator correctly breaks user request into components + pipelines
- [ ] Verify orchestrator dispatches pipeline sub-agents with correct tools
- [ ] Verify `sub-agent.ts` pipeline build sub-agent has access to all pipeline tools
- [ ] Verify `DynamicComponent.tsx` bridge extension is safe (no injection, proper cleanup)
- [ ] Verify `pipelineStore.ts` hydrates from pipelines.json on load
- [ ] Verify `PipelinePanel.tsx` handles empty state and errors gracefully
- [ ] Verify `router.ts` correctly routes to pipeline-wirer skill
- [ ] Verify `CSlateServerClient.ts` — same deletion issue, restore from main
- [ ] Check all tests pass: `cd .worktrees/data-pipelines-integration && npm test`

---

### CSlate Merge Conflicts to Resolve

| File | Runtime (A) | Agent-Tools (B) | Integration (C) | Resolution |
|------|------------|-----------------|-----------------|------------|
| `src/main/pipeline/compiler.ts` | Created | Identical copy | Not present | Take from A |
| `src/main/pipeline/types.ts` | Created | Identical copy | Not present | Take from A |
| `src/main/pipeline/worker-shim.js` | Created | Identical copy | Not present | Take from A |
| `src/main/pipeline/pipelines-json.ts` | Created | **Different version** | Not present | **MUST DIFF AND RECONCILE** |
| `src/main/server/CSlateServerClient.ts` | Deleted content | Different changes | Deleted content | **MUST RESTORE FROM MAIN + add B's pipeline methods** |

### CSlate Merge Order

1. Merge `feature/data-pipelines-runtime` into main first (base runtime layer)
2. Merge `feature/data-pipelines-agent-tools` second (resolve pipelines-json.ts + CSlateServerClient.ts conflicts)
3. Merge `feature/data-pipelines-integration` last (resolve CSlateServerClient.ts, depends on both A and B)
4. After all merges: run `npm test` and `npm run typecheck` on main

---

## Repo 2: CSlate-server (Backend)

**Main branch:** `main` at `ba2b3c2`
**Repo path:** `/Users/tomerast/Projects/CSlate-server`

**IMPORTANT:** All 3 server branches include the full `phase-1-scaffolding` merge (commit `76553b9` / `822011f`). This means ~90 shared files are identical across branches. The actual pipeline-specific work is a small delta on top.

### Branch D: `feature/data-pipelines-data-layer` (6 unique commits after scaffolding merge)

**What it does:** Pipeline database schema, migration, search queries, R2 storage.

**Unique files created:**
- `packages/db/drizzle/0001_add_pipelines.sql` — Migration: pipelines table + pipeline_uploads staging table
- `packages/db/src/schema/pipelines.ts` — Drizzle schema for pipelines table (pgvector embedding column)
- `packages/db/src/schema/pipeline-uploads.ts` — Drizzle schema for pipeline_uploads staging
- `packages/db/src/queries/pipelines.ts` — Hybrid vector search, CRUD, list queries
- `packages/storage/src/pipelines.ts` — R2 storage: uploadPipelineBundle, downloadPipelineBundle, deletePipelineBundle

**Shared files modified (beyond scaffolding):**
- `packages/db/src/index.ts` — Exports pipeline schemas + queries
- `packages/db/src/schema/index.ts` — Exports pipeline + pipeline-upload schemas
- `packages/storage/src/index.ts` — Exports pipeline storage

**Review checklist:**
- [ ] Verify migration SQL creates correct indexes (GIN for tags, pgvector for embedding)
- [ ] Verify `pipelines.ts` schema matches the design spec fields
- [ ] Verify hybrid search query combines text + vector similarity correctly
- [ ] Verify R2 storage key naming convention matches component pattern
- [ ] Verify `pipeline-uploads.ts` staging table has proper status enum
- [ ] Run migration against test DB if possible

---

### Branch E: `feature/data-pipelines-review-pipeline` (9 unique commits after scaffolding merge)

**What it does:** 6-stage review pipeline for validating uploaded pipelines before cataloging.

**Unique files created:**
- `packages/pipeline/src/pipeline-types.ts` — PipelineManifest Zod schema for server-side validation
- `packages/pipeline/src/pipeline-stages/1-manifest-validation.ts` — Validates manifest structure + required fields
- `packages/pipeline/src/pipeline-stages/2-security-scan.ts` — Static analysis for dangerous patterns (eval, child_process, etc.)
- `packages/pipeline/src/pipeline-stages/3-dependency-check.ts` — Validates dependencies against allowlist
- `packages/pipeline/src/pipeline-stages/4-quality-review.ts` — LLM-based code quality assessment
- `packages/pipeline/src/pipeline-stages/5-cataloging.ts` — LLM enrichment: tags, description, use cases
- `packages/pipeline/src/pipeline-stages/6-embedding.ts` — Generate embedding vector + store to DB
- `packages/pipeline/src/pipeline-runner.ts` — Runs all 6 stages sequentially, returns aggregate result
- `apps/worker/src/handlers/pipeline-review.ts` — pg-boss job handler that invokes pipeline-runner
- `packages/queue/src/pipeline-jobs.ts` — Pipeline review job type definition

**Shared files modified (beyond scaffolding):**
- `packages/pipeline/src/index.ts` — Exports pipeline stages + runner
- `packages/queue/src/index.ts` — Exports pipeline job types
- `apps/worker/src/index.ts` — Registers pipeline-review job handler
- `packages/storage/src/index.ts` — Exports (may differ from data-layer)

**IMPORTANT NOTE:** This branch created pipeline stages under `packages/pipeline/src/pipeline-stages/` while the existing component review stages are under `packages/pipeline/src/stages/`. Review whether this is intentional separation or should be unified.

**Review checklist:**
- [ ] Verify `pipeline-types.ts` schema matches `@cslate/shared` PipelineManifestSchema
- [ ] Verify 6 stages run in correct order and pass context between them
- [ ] Verify security scan catches: eval(), child_process, fs.write, network to non-allowlisted URLs
- [ ] Verify dependency check uses the allowlist files in `packages/pipeline/config/`
- [ ] Verify quality review LLM prompt is appropriate for pipeline code (not component code)
- [ ] Verify cataloging stage generates useful tags and description
- [ ] Verify embedding stage stores vector in correct DB column
- [ ] Verify pipeline-runner handles stage failures gracefully (reports which stage failed)
- [ ] Verify worker handler correctly dequeues and processes pipeline review jobs
- [ ] Check if `pipeline-stages/` should merge with `stages/` or remain separate

---

### Branch F: `feature/data-pipelines-api-routes` (5 unique commits after scaffolding merge)

**What it does:** Hono API routes for pipeline CRUD, search, upload, combined search.

**Unique files created:**
- `apps/api/src/routes/pipelines.ts` — GET/POST pipeline search, GET pipeline by ID, GET pipeline source
- `apps/api/src/routes/pipeline-uploads.ts` — POST pipeline upload, GET upload status
- `apps/api/src/routes/search.ts` — Combined component + pipeline search endpoint

**Shared files modified (beyond scaffolding):**
- `apps/api/src/index.ts` — Mounts pipeline routes on the Hono app
- `packages/db/src/index.ts` — Same as data-layer branch
- `packages/db/src/schema/index.ts` — Same as data-layer branch
- `packages/pipeline/src/types.ts` — Different version (different hash from data-layer/review-pipeline)
- `packages/queue/src/jobs.ts` — Different version (includes pipeline job types inline)
- `packages/storage/src/index.ts` — Same as data-layer branch
- `packages/storage/src/pipelines.ts` — Same as data-layer branch (duplicated the work)

**NOTE:** This branch duplicated data-layer work (DB schemas, queries, storage). It also has a different `packages/pipeline/src/types.ts` and `packages/queue/src/jobs.ts` than the other branches.

**Review checklist:**
- [ ] Verify routes follow existing component route patterns (auth middleware, validation, error responses)
- [ ] Verify search endpoint supports both text and vector queries
- [ ] Verify upload endpoint enqueues a pipeline-review job (connects to branch E)
- [ ] Verify combined search returns results from both component and pipeline tables
- [ ] Verify proper auth on all routes
- [ ] Verify rate limiting on upload and search endpoints
- [ ] Reconcile `packages/pipeline/src/types.ts` with other branches
- [ ] Reconcile `packages/queue/src/jobs.ts` with branch E's `pipeline-jobs.ts`

---

### Server Merge Conflicts to Resolve

| File | Data-Layer (D) | Review-Pipeline (E) | API-Routes (F) | Resolution |
|------|---------------|---------------------|----------------|------------|
| `apps/api/src/index.ts` | scaffolding | scaffolding | **Pipeline routes mounted** | Take F |
| `apps/worker/src/index.ts` | scaffolding | **Pipeline review handler** | scaffolding | Take E |
| `packages/db/src/index.ts` | **Pipeline exports** | scaffolding | **Same as D** | Take D (F has same) |
| `packages/db/src/schema/index.ts` | **Pipeline schemas** | scaffolding | **Same as D** | Take D (F has same) |
| `packages/pipeline/src/index.ts` | scaffolding | **Pipeline stages exports** | scaffolding | Take E |
| `packages/pipeline/src/types.ts` | scaffolding | scaffolding | **Different version** | **MUST DIFF AND RECONCILE** |
| `packages/queue/src/index.ts` | scaffolding | **Pipeline jobs export** | scaffolding | Take E |
| `packages/queue/src/jobs.ts` | scaffolding | scaffolding | **Pipeline jobs inline** | **MUST RECONCILE with E's pipeline-jobs.ts** |
| `packages/storage/src/index.ts` | **Pipeline export** | scaffolding | **Same as D** | Take D |

### Server Merge Order

1. Merge `feature/data-pipelines-data-layer` into main first (base DB + storage layer)
2. Merge `feature/data-pipelines-review-pipeline` second (resolve index.ts re-exports)
3. Merge `feature/data-pipelines-api-routes` last (resolve types.ts, jobs.ts, deduplicate DB work)
4. After all merges: run `pnpm build` and `pnpm test` across all packages

---

## Cross-Repo Integration Checks

After merging all branches in both repos:

- [ ] CSlate `searchPipelineBlueprints` tool calls correct CSlate-server API endpoints (match route paths)
- [ ] CSlate `CSlateServerClient.ts` pipeline methods match server API contract (request/response shapes)
- [ ] Pipeline manifest schema is consistent across all 3 locations:
  - `@cslate/shared` (npm package)
  - `src/main/pipeline/types.ts` (CSlate client)
  - `packages/pipeline/src/pipeline-types.ts` or `types.ts` (CSlate-server)
- [ ] Upload flow works end-to-end: CSlate `writePipeline` → upload via `CSlateServerClient` → server receives → enqueues review → review pipeline processes → pipeline cataloged
- [ ] Search flow works: CSlate `searchPipelineBlueprints` → server search endpoint → returns results with metadata

---

## Post-Merge Verification

### CSlate
```bash
cd /Users/tomerast/Projects/CSlate
npm test
npm run typecheck
npm run dev  # smoke test: open app, verify no console errors
```

### CSlate-server
```bash
cd /Users/tomerast/Projects/CSlate-server
pnpm build
pnpm test
pnpm dev  # smoke test: verify API starts, pipeline routes respond
```

### Full Stack
```bash
cd /Users/tomerast/Projects/CSlate
npm run dev:full  # starts both Electron + server
# Test: chat "build a pipeline that fetches weather data"
# Verify: agent creates pipeline files, compiles, executor runs it
```

---

## Known Issues to Watch For

1. **CSlateServerClient.ts deletion bug** — All 3 CSlate branches appear to have deleted or reverted content from this file. The main branch version must be preserved, with pipeline methods added on top.

2. **Duplicate pipeline runtime files in agent-tools** — Branch B copied compiler.ts, types.ts, worker-shim.js, pipelines-json.ts from the runtime plan instead of importing from branch A. During merge, take A's versions and ensure B's tools import from the correct paths.

3. **Server duplicate DB work** — Branch F (API routes) duplicated all of D's DB schema + query + storage work. During merge, D's versions are canonical; F's duplicates will auto-resolve as identical or need manual reconciliation.

4. **Two pipeline stage directories on server** — Branch E created `pipeline-stages/` while existing component stages are in `stages/`. Decide: keep separate (cleaner) or merge (consistent). Recommendation: keep separate with clear naming.

5. **Schema consistency** — Three different locations define PipelineManifest. After merge, verify all three are in sync. Ideally, CSlate-server should import from `@cslate/shared` rather than maintaining its own copy.
