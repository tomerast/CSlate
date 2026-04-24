# CSlate — Product & Architecture Specification

> Current implementation continuity lives in `docs/continuity.md`. This spec is useful product context, but any implementation detail that conflicts with `docs/continuity.md` or the code should be treated as historical and corrected.

**Version:** 1.0  
**Date:** 2026-04-24  
**Status:** Living document — source of truth for all three repos

---

## 1. What CSlate Is

CSlate is a desktop application where users talk to language models. Unlike a plain chat interface, CSlate blends **rendered UI cards directly inside conversation responses** — making LLM answers beautiful, interactive, and visual by default.

The core promise: *every response from an LLM is an opportunity to show information better than plain text.*

---

## 2. The North Star Loop

```
User sends a message
        │
        ▼
Agent answers the question (text)
        │
        ▼
Agent decides: can this be rendered better as a UI card?
        │
        ├── YES ──► Search CSlate Server for a matching render component
        │                   │
        │           ┌───────┴───────────┐
        │           │                   │
        │        Found                Not found
        │           │                   │
        │     Fetch component       Agent generates
        │     from server           component from scratch
        │           │                   │
        │           └────────┬──────────┘
        │                    │
        │              Render card inline
        │              in the conversation
        │                    │
        │              Needs changes?
        │               ├── NO  ──► Done. Card shown.
        │               └── YES ──► Agent edits component locally
        │                           ► Uploads new version to server
        │                           ► Server deep-reviews it
        │                           ► Card updated. Available to all.
        │
        └── NO  ──► Plain text response rendered
```

This loop is the heartbeat of the entire platform. Every architectural decision serves it.

---

## 3. Key Differentiators

- **UI-first responses** — the LLM is prompted to always consider a visual rendering. Plain text is the fallback, not the default.
- **Community component library** — components built and refined by one user become instantly available to all. The server is the shared brain.
- **Provider agnostic** — switch between OpenAI, Anthropic, Google, or local models on the fly. Local state (components, memories) makes the transition seamless.
- **Persistent user memory** — the agent remembers user preferences, past decisions, and domain context across sessions and provider switches.
- **Lightning fast rendering** — components are pre-built, stored as bundles on the server, fetched and rendered in milliseconds. Generation is only needed for new or unseen requests.

---

## 4. Repositories

| Repo | Role |
|---|---|
| `CSlate` | Electron desktop client — the app users run |
| `CSlate-server` | Backend API + review pipeline + component library |
| `CSlate-shared` | npm package `@cslate/shared` — Zod schemas, shared types, agent infrastructure |

---

## 5. CSlate Client Architecture

### 5.1 Runtime & Build

| Layer | Technology |
|---|---|
| Shell | Electron 30 |
| Build | electron-vite 2 + Vite 5 |
| Language | TypeScript 5.9 strict |
| UI framework | React 18 |
| Styling | Tailwind CSS 3 (semantic tokens only) |
| State | Zustand 4 |
| AI SDK | Vercel AI SDK v6 (`ai` package) |
| LLM providers | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `ollama-ai-provider` |
| Provider registry | `@cslate/shared/agent` → `buildRegistry` / `runAgentStream` |
| Bundler (components) | esbuild 0.27 (CJS, react/react-dom externalized) |
| Markdown | `react-markdown` |
| Config store | `electron-store` 8 (sensitive fields via `safeStorage`) |
| Logger | `pino` 10 |
| Tests | Vitest 1 + Testing Library |
| Shared contracts | `@cslate/shared` (installed from `github:tomerast/CSlate-shared#main`) |

### 5.2 Two Processes

```
Main Process (Node.js)
  ├── agent/          AgentEngine — LLM orchestration, skills, tools, memory
  ├── ipc/            IPC handler registrations
  ├── pipeline/       Local esbuild bundle pipeline
  ├── server/         CSlateServerClient — typed HTTP wrapper
  └── lib/            store.ts, logger.ts, paths.ts

Renderer Process (React + Vite)
  ├── chat/           AppLayout integration, MessageList, DockedChatBar, useChat
  ├── sandbox/        DynamicComponent — esbuild CJS eval + ErrorBoundary
  └── store/          chatStore, appStore (Zustand)
```

### 5.3 Chat Interface (Primary Mode)

A **conversation view**. Each LLM response can contain:

1. **Plain text** — rendered via `react-markdown`
2. **UI cards** — React component bundles rendered inline in the message via `DynamicComponent`
3. **Mixed** — text prefix + one or more cards

Cards are CJS bundles executed via a controlled require-shim. No iframe — components run in the renderer process with React and react-dom shimmed in.

### 5.4 Agent Engine

```
AgentEngine (engine.ts)
  ├── router.ts           Intent classifier (runStructuredAgent via @cslate/shared/agent)
  ├── orchestrator/       Orchestrator — multi-phase tool loop (runAgentStream)
  ├── skills/             Legacy skill registry (buildSkillRegistry)
  ├── tools/              AI SDK tool definitions (buildToolSet)
  ├── actions/            Direct actions (no LLM call) via actionRegistry
  ├── memory/             Read/write ~/.cslate/memory/*.md
  └── prompts/            System prompt fragments
```

**Dispatch priority:**
1. `action` → direct handler from `actionRegistry`, no LLM call
2. `orchestrator` → `Orchestrator.stream()` — full multi-phase tool loop
3. `skill` → legacy skill via `runAgentStream`
4. `direct` → plain `runAgentStream` with no tools

**Agent infrastructure from `@cslate/shared/agent`:**
- `buildRegistry(config)` — creates Vercel AI SDK `ProviderRegistry` for all 4 providers
- `runAgentStream(params)` — wraps `streamText` with step budgeting, `prepareStep`, `onStepFinish`
- `runSubAgent(params)` — wraps `generateText` for expert/judge sub-agents
- `runStructuredAgent(params)` — wraps `generateObject` for intent classification
- `autoCompactIfNeeded` — trims conversation history before context limit
- `budgetToolResult` — limits tool output size to prevent context blowout

### 5.5 LLM Provider Switching

```typescript
interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'local'
  model: string
  apiKey?: string      // safeStorage encrypted
  baseUrl?: string     // for Ollama / custom gateway
  fastModel?: string   // optional faster model for classifier/sub-agents
}
```

`buildRegistry(config)` returns an AI SDK `ProviderRegistry`. OpenAI is patched to use Chat Completions (not Responses API) so gateways work. Ollama is cast from ProviderV1 to ProviderV3.

Fast model defaults per provider:
- `anthropic` → `claude-haiku-4-5-20251001`
- `openai` → `gpt-4o-mini`
- `google` → `gemini-1.5-flash`
- `local` → same as main model

Switching providers is instant and seamless — all local state (bundles, memory) is provider-independent.

### 5.6 User Memory

Stored at `~/.cslate/memory/` (or `projectDir/memory/`):

| File | Content |
|---|---|
| `MEMORY.md` | Index |
| `user_preferences.md` | Visual/data style preferences |
| `domain_context.md` | User's work domain |
| `componentHistory` entries | Built components, iteration counts, outcomes |

Injected into the agent system prompt on every turn via `readMemory()`. Written via `writeMemoryEntry()`.

---

## 6. CSlate Server Architecture

The server is the **shared community brain** — stores, indexes, reviews, and serves components.

### 6.1 Stack

| Layer | Technology |
|---|---|
| API Framework | Hono 4 + `@hono/node-server` + `@hono/zod-validator` |
| ORM | Drizzle ORM 0.40 |
| Database | PostgreSQL 16 + pgvector (local: Docker `pgvector/pgvector:pg16`) |
| File Storage | Cloudflare R2 in prod / MinIO (S3-compat) in dev |
| S3 Client | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Job Queue | pg-boss 10 |
| LLM (review) | Anthropic SDK 0.36 + OpenAI SDK 4.77 (server-owned keys) |
| Logger | pino 9 + pino-pretty |
| Monorepo | pnpm workspaces + Turborepo 2 |
| Build | tsup (CJS output per package) |
| Dev runner | `tsx watch` (no restart needed) |
| Tests | Vitest 2 |
| Email (dev) | MailHog (SMTP at 1025, UI at 8025) |
| Node requirement | >= 22 |

### 6.2 Monorepo Layout

```
apps/
  api/        @cslate/api     — Hono HTTP server
  worker/     @cslate/worker  — pg-boss job consumer

packages/
  db/         @cslate/db      — Drizzle schema + migrations + query helpers
  llm/        @cslate/llm     — Anthropic + OpenAI clients for review + embedding
  pipeline/   @cslate/pipeline — 7-stage review pipeline (pure logic)
  queue/      @cslate/queue   — pg-boss job type definitions + producers
  storage/    @cslate/storage — S3/R2/MinIO abstraction
  logger/     @cslate/logger  — pino structured logger
```

Build order (Turborepo): `logger` → `db`, `llm`, `queue`, `storage` → `pipeline` → `api`, `worker`

### 6.3 Component Search (The Hot Path)

Every client hits this on every "render" decision. Target: **< 200ms p95**.

```
GET /api/v1/components/search?q={render_intent}&limit=5

1. Embed query → text-embedding-3-small (1536 dims) via @cslate/llm
2. HNSW cosine distance search over components table (pgvector)
3. Re-rank: (cosine × 0.7) + (quality_score × 0.2) + (recency × 0.1)
4. Return top N: manifest + bundle_url + relevance_score
```

### 6.4 Component Review Pipeline (7 Stages)

Runs in `@cslate/worker` via pg-boss job. Logic lives in `@cslate/pipeline`.

```
Stage 1: manifest_validation   — ComponentManifestSchema.safeParse() via @cslate/shared
Stage 2: security_scan         — @typescript-eslint/typescript-estree AST analysis
Stage 3: dependency_check      — declared deps safety + availability
Stage 4: quality_review        — LLM code review + Tailwind token enforcement
Stage 5: test_render           — esbuild TypeScript compilation check
Stage 6: cataloging            — LLM summarization, categorization, manifest.ai enrichment
Stage 7: embedding             — text-embedding-3-small → pgvector column
```

SSE stream per stage: `GET /api/v1/components/upload/:id/stream`

**Hard rejections:**
- `STYLING_TOKEN_VIOLATION` — raw Tailwind color utilities (Stage 4)
- `TOO_MANY_DATA_SOURCES` — > 5 dataSources in manifest (Stage 1)
- `SECURITY_VIOLATION` — dangerous API patterns (Stage 2)

### 6.5 Component Revocation

Clients learn via `POST /api/v1/components/check-updates` response. Component stays functional locally — user decides to keep or delete.

---

## 7. CSlate-Shared Package

`@cslate/shared` (v0.3) is the single source of truth for all cross-repo contracts AND the shared agent infrastructure.

### 7.1 Two Entry Points

```
@cslate/shared         Main entry — Zod schemas + TypeScript types
@cslate/shared/agent   Agent infrastructure — provider registry, loops, utilities
```

### 7.2 Main Entry (`src/index.ts`)

```
src/schemas/
  manifest.ts           ComponentManifest — core component contract
  pipeline-manifest.ts  PipelineManifest — data pipeline packages
  checkpoint.ts         Per-user private backups
  api.ts                All API request/response bodies
src/templates/
  component.ts          Component scaffold template (used by component-builder)
src/types/              All z.infer<> type re-exports
```

### 7.3 Agent Entry (`src/agent/`)

```
providers.ts     buildRegistry(config) — creates AI SDK ProviderRegistry
                 mainModelId(config), fastModelId(config)
loop.ts          runAgentStream() — streamText wrapper
                 runSubAgent() — generateText wrapper
                 runStructuredAgent() — generateObject wrapper
tools/types.ts   CSTool, buildTool, toAISDKTools
lib/
  compact.ts       autoCompactIfNeeded, estimateTokens, shouldCompact
  result-budget.ts budgetToolResult
  strip-fences.ts  stripFences
  abort-utils.ts   createChildAbortController
```

Both `CSlate` client and `CSlate-server` use the same agent infrastructure from this package.

### 7.4 The ComponentManifest

The most important schema. Enables search, rendering, wiring, review, and permissions. Key rules:
- `dataSources` max 5 — `TOO_MANY_DATA_SOURCES` on violation
- `userConfig.sensitive = true` fields stripped before upload
- `ai` hints absent until server Stage 6 completes
- `id` and `version` are server-assigned

---

## 8. The Component Lifecycle

```
1. SEARCH
   Client agent queries server with render intent
   Server returns ranked results with manifests

2. USE (cache hit)
   Client fetches bundle from R2 via manifest URL
   DynamicComponent executes bundle in sandboxed context
   Card rendered inline in conversation

3. GENERATE (cache miss)
   Agent builds React component locally
   component-builder skill writes ui.tsx + manifest.json
   esbuild bundles to CJS format
   DynamicComponent executes and renders preview

4. REFINE (optional)
   User or agent requests changes
   Agent edits component source
   Re-bundle → re-render inline

5. UPLOAD
   Agent uploads ComponentPackage to server
   Server streams 7-stage review via SSE
   On approval: component enters community library
   Card in conversation updates to approved version

6. REVOCATION (exceptional)
   Server flags component
   Client notified via check-updates poll
   User retains local copy, component removed from search
```

---

## 9. Data Flow Diagram

```
User message
     │
     ▼
AgentEngine (main process)
     ├── router.ts classifies intent
     ├── if render intent:
     │     └── CSlateServerClient.search(query)
     │               │
     │         ┌─────┴──────────────────────┐
     │         │  CSlate Server              │
     │         │  pgvector semantic search   │
     │         │  returns: manifest + score  │
     │         └─────┬──────────────────────┘
     │               │
     │         score ≥ threshold?
     │         ├── YES: fetch bundle URL from R2
     │         │         send bundle to renderer via IPC
     │         │         DynamicComponent renders card
     │         │
     │         └── NO:  component-builder skill generates code
     │                   esbuild bundles
     │                   send bundle to renderer via IPC
     │                   DynamicComponent renders card
     │                   agent uploads to server async
     │
     └── stream text response chunks to renderer via IPC
              renderer appends chunks to message
              if card: card rendered inline in message
```

---

## 10. LLM Provider Abstraction

The agent uses Vercel AI SDK provider registry. Adding a new provider:

1. Register in `src/main/agent/lib/providers.ts`
2. User configures key + model in settings UI
3. Agent uses the configured provider transparently

Local model support (Ollama) is included. No internet required for the LLM path — only the server API calls (component search/upload) require connectivity.

---

## 11. Security Model

### Component Sandbox
Components execute in a sandboxed context (esbuild CJS eval with controlled require-shim). They cannot:
- Access Node.js APIs
- Make arbitrary network requests (proxied only via declared `dataSources`)
- Read/write the filesystem
- Access other components' private state

### Data Bridge
External API calls from components go through the data bridge in main process:
- Only endpoints declared in `dataSources` manifest field are allowed
- User must grant permission per data source
- Sensitive `userConfig` fields (API keys) never leave the machine

### Server Review
The 7-stage pipeline is the server-side security gate. No component enters the community library without passing all stages.

---

## 12. What Is Not CSlate

To keep scope clear:

- **Not a whiteboard app** — generated components render as inline cards inside assistant messages.
- **Not a no-code builder** — users do not drag-and-drop components. The LLM builds and arranges them.
- **Not a general AI coding assistant** — CSlate's agent specializes in building and using render components. It is not a general-purpose coding agent.
- **Not a cloud app** — CSlate is desktop-first. User data (memory, local components) stays local.

---

## 13. Milestones

### M1 — Chat-First Render Loop (Current Focus)
- Chat interface renders LLM responses with inline UI cards
- Agent performs search → render decision on every turn
- Server search working (semantic vector search)
- Component bundle fetch + DynamicComponent render in conversation

### M2 — Community Library Live
- Upload + 7-stage review pipeline live on server
- Client shows review progress via SSE
- Approved components searchable by all users

### M3 — Provider Switching + Memory
- Multi-provider support (OpenAI, Anthropic, local)
- User memory injected into agent context
- Memory editable from settings UI

### M4 — Component Ecosystem
- Trending/popular component discovery
- Component rating system
- Revocation handling on client
