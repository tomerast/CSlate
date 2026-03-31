# Agent Orchestrator Design

## Overview

Redesign the CSlate coding agent into a three-tier autonomous architecture: **Router > Orchestrator > Sub-Agents**. The orchestrator plans component work and dispatches parallel sub-agents for execution. Blueprint search from the CSlate Server (embedding-based) is used as base code to accelerate builds, not just reference.

## Goals

- User says what they want, gets back a clean component — fast
- Orchestrator never writes code — it plans, delegates, validates, ships
- Sub-agents build files in parallel, each with isolated context
- Server blueprints are the primary acceleration mechanism — adapt, don't rebuild
- Max 2 fix cycles before surfacing errors to the user

## Non-Goals

- Graph-based workflow engine (deferred to v2)
- SES Compartments / near-membrane (deferred)
- MCP server integration (deferred)
- User-defined custom skills/workflows (deferred)

---

## Architecture: Three Tiers

### Tier 1: Router (Fast Model)

**Role:** Classify user intent. Route to the right system. No code, no planning.

**Model:** Fast model (haiku / gpt-4o-mini) for <500ms response.

**Input:** User message + conversation history.

**Output:** Which system handles this request.

**Routes:**
- Component work (build, modify, style, wire) → **Orchestrator**
- Non-component queries (settings, help, general) → **Direct response**

**Implementation:** Evolve existing `intent.ts`. Simplify from 7 skills to 2 routes. Keep `generateObject` + Zod schema pattern.

### Tier 2: Orchestrator (Top-Tier Model)

**Role:** Own the full component coding lifecycle. Understand, search, plan, dispatch, assemble, validate, ship.

**Model:** Top-tier model (claude-sonnet-4-6 / gpt-4o). Needs strong reasoning for planning and error diagnosis.

**Runs as:** Independent agent loop via `streamText` (Vercel AI SDK). Not a skill inside the current engine — a standalone agent with its own tools.

**Phases:**

#### Phase 1: UNDERSTAND
- Parse user request into structured requirements
- Extract: component purpose, features, constraints, visual expectations
- If modifying existing component: read current source + manifest

#### Phase 2: SEARCH
- Call `searchBlueprints` on CSlate Server (embedding-based)
- Evaluate match quality:
  - **Strong match:** Fetch full source. This becomes the base code. Sub-agents adapt it.
  - **Weak match:** Use as structural reference. Sub-agents write fresh but informed.
  - **No match:** Build from scratch.
- Fallback: scan local `components/` directory for similar components

#### Phase 3: PLAN
- Decide which files the component needs (minimum: `ui.tsx`)
- Define shared contract: TypeScript interfaces, prop types, state shape
- Create task list: one task per file/concern
- If strong blueprint match: tasks are "adapt this file" not "build from scratch"
- If simple adaptation needed: may plan a single sub-agent instead of many

#### Phase 4: DISPATCH
- Spawn N sub-agents in parallel via `Promise.all`
- Each sub-agent receives: assignment, contract, blueprint (if available), scoped tools
- Stream sub-agent progress to UI via independent IPC channels

#### Phase 5: ASSEMBLE
- Collect results from all sub-agents
- Merge files into component package directory
- Verify imports align (logic.ts exports match ui.tsx imports)
- Verify types contract is satisfied

#### Phase 6: VALIDATE
- `validateManifest()` — Zod schema check
- `renderComponent()` — load in sandbox iframe
  - Renders clean → Phase 7 SHIP
  - Error → Phase 7 FIX

#### Phase 7: SHIP or FIX
- **SHIP:** `writeComponent()` to disk, stream final result to UI, write memory
- **FIX:** Read error, identify which file is responsible, dispatch targeted fix sub-agent(s)
  - Fix sub-agent gets: broken file + error message + contract
  - Returns patched file
  - Back to Phase 6 (max 2 fix cycles, then surface error to user)

**Orchestrator Tools:**
| Tool | Purpose |
|------|---------|
| `searchBlueprints` | Query CSlate Server for community components (embedding search) |
| `scanLocalComponents` | Scan local project components for structural similarity (new) |
| `readProjectContext` | Read app manifest + active component manifests |
| `readManifest` | Read existing component manifest (for modifications) |
| `dispatchSubAgents` | Spawn parallel build sub-agents, collect results |
| `renderComponent` | Load assembled component in sandbox for validation |
| `validateManifest` | Validate manifest against Zod schema |
| `writeComponent` | Persist final component package to disk |

### Tier 3: Sub-Agents (Disposable Workers)

**Role:** Build a single file or concern. Focused, fast, disposable.

**Model:** Standard model. Doesn't need top-tier reasoning — it has a clear assignment.

**Lifecycle:**
1. Receive assignment from orchestrator (file to build, contract, blueprint if available)
2. Run own `generateText` loop (1-4 steps)
3. Return `{ file, code, status }` to orchestrator
4. Destroyed — no persistent state

**Rules:**
- No conversation history — fresh context per task
- Cannot spawn other sub-agents — one level deep only
- Scoped tool access: only `writeFile` and `readContract` (no search, no render, no validate)
- If a sub-agent fails, it returns the error — orchestrator decides what to do

**Sub-Agent Prompt Structure:**
```
You are a component file builder for CSlate.

CONTRACT (shared types):
{contract}

BLUEPRINT (base code to adapt):
{blueprint_file_content OR "Build from scratch"}

ASSIGNMENT:
Build {filename} that {description}.

PLATFORM RULES:
{PLATFORM_KNOWLEDGE fragment — sandbox constraints, allowed APIs}

Return ONLY the file content. No explanations.
```

---

## IPC Streaming Protocol

Extends existing IPC channels to support parallel sub-agent progress:

```
agent:orchestrator:status   → Phase updates ("Searching blueprints...", "Planning...", "Dispatching 3 workers...")
agent:orchestrator:token    → Orchestrator reasoning (planning text, streamed to chat)
agent:worker:{id}:status    → Sub-agent status ("Building ui.tsx...")
agent:worker:{id}:token     → Sub-agent progress (optional, for verbose mode)
agent:worker:{id}:done      → Sub-agent completed
agent:done                  → Final assembled component ready
agent:error                 → Fatal error
```

The renderer can show:
- Orchestrator thinking in chat
- Parallel build progress indicators per worker
- Final component preview in sandbox

---

## Blueprint Acceleration

The embedding search on CSlate Server is the primary speed mechanism.

**Strong match behavior:**
- Orchestrator fetches the full component source (all files)
- Analyzes diff between blueprint and requirements
- Plans tasks as adaptations: "change the card layout from grid to kanban", "add drag-and-drop handler to logic.ts"
- Sub-agents receive the blueprint file as base code with modification instructions
- Result: most of the code is reused, only deltas are generated

**Weak match behavior:**
- Orchestrator extracts useful patterns (state management approach, component structure)
- Passes patterns as reference context, not base code
- Sub-agents write fresh code informed by the patterns

**No match behavior:**
- Pure generation from contract and requirements
- Sub-agents build from scratch using PLATFORM_KNOWLEDGE constraints

---

## Replacing Current Architecture

The orchestrator replaces these current skills:
- `component-builder` → Orchestrator Phase 1-7 (new build)
- `component-modifier` → Orchestrator Phase 1 reads existing + Phase 2-7 (modify)
- `style-applier` → Orchestrator recognizes styling task, plans minimal adaptation
- `feedback-iterator` → Orchestrator with conversation history, re-plans based on feedback
- `manifest-generator` → Sub-agent task within orchestrator plan

Skills that remain independent (routed directly by Tier 1):
- `state-wirer` — cross-component wiring, not a single-component task
- `component-search` — standalone search without building

The existing `reviewCode` sub-agent is absorbed into the orchestrator's Phase 6 validation.

---

## File Structure

```
src/main/agent/
├── router.ts                    ← Tier 1: intent classification (evolved from intent.ts)
├── orchestrator/
│   ├── index.ts                 ← Tier 2: orchestrator agent loop
│   ├── phases/
│   │   ├── understand.ts        ← Phase 1: parse requirements
│   │   ├── search.ts            ← Phase 2: blueprint search + evaluation
│   │   ├── plan.ts              ← Phase 3: task planning + contract definition
│   │   ├── dispatch.ts          ← Phase 4: sub-agent spawning
│   │   ├── assemble.ts          ← Phase 5: merge + integration check
│   │   └── validate.ts          ← Phase 6-7: render, validate, fix loop
│   ├── sub-agent.ts             ← Tier 3: sub-agent factory + prompt builder
│   └── types.ts                 ← Orchestrator-specific types
├── tools/                       ← Shared tools (existing + new)
│   ├── renderComponent.ts
│   ├── writeComponent.ts
│   ├── validateManifest.ts
│   ├── readManifest.ts
│   ├── readProjectContext.ts
│   ├── searchBlueprints.ts
│   └── scanLocalComponents.ts   ← NEW: local component similarity scan
├── memory/                      ← Unchanged
├── prompts/                     ← Unchanged (fragments reused by sub-agents)
├── providers.ts                 ← Unchanged
├── ipc.ts                       ← Extended for multi-agent streaming
└── skills/                      ← Reduced: only state-wirer, component-search remain
```

---

## Model Selection

| Agent | Model | Reason |
|-------|-------|--------|
| Router | Fast (haiku/mini) | Classification only, speed matters |
| Orchestrator | Top-tier (sonnet/gpt-4o) | Needs reasoning for planning, error diagnosis, assembly |
| Build sub-agents | Standard (sonnet/gpt-4o) | Clear assignment, doesn't need top reasoning |
| Fix sub-agents | Standard (sonnet/gpt-4o) | Has error context, focused fix |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Search fails (server down) | Skip to local scan, then build from scratch |
| Sub-agent fails to return | Orchestrator retries once, then builds that file itself via a new sub-agent |
| Render fails | Orchestrator reads error, dispatches fix sub-agent with error context |
| Fix fails twice | Surface error to user with: what was built, what broke, suggested manual fix |
| All sub-agents fail | Surface error to user, preserve any partial results |

---

## Success Criteria

- User request to clean component in <30s for blueprint-adapted builds
- User request to clean component in <60s for from-scratch builds
- Zero orchestrator-generated code — all code comes from sub-agents
- Sandbox render pass rate >90% on first attempt (before fix cycles)
- Blueprint reuse rate tracked in memory for optimization
