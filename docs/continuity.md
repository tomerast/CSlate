# CSlate Client — Continuity Guide

**Scope:** `CSlate` Electron desktop client  
**Last reviewed:** 2026-04-24  
**Purpose:** give future maintainers enough product, architecture, and decision context to continue development without rediscovering the system from scratch.

---

## Product Concept

CSlate is a desktop chat portal for LLMs. The primary surface is a conversation, not a canvas. The assistant normally streams text, but when an answer would be clearer as a visual, it renders a live React card inline in the assistant message.

The client owns:

1. The Electron shell, chat UI, session persistence, settings, memory editor, and card sandbox.
2. The main-process agent engine that routes each turn into chat, render, build, or card-fix behavior.
3. Local component generation and bundling when the server library has no good match.
4. Fetching trusted component bundles from CSlate Server and rendering them inline.

The server owns shared library search, upload review, storage, and approved bundle retrieval. `@cslate/shared` owns cross-repo schemas and shared agent infrastructure.

---

## Repository Shape

```text
src/
  main/
    agent/          turn routing, render decision, orchestrator, tools
    ipc/            Electron IPC handlers
    lib/            logger, paths, encrypted config store
    memory/         user-visible global memory at ~/.cslate/memory
    pipeline/       local data-pipeline runtime for cards
    server/         CSlateServerClient HTTP wrapper
    sessions/       JSON session store at ~/.cslate/sessions
  preload/          contextBridge and IPC allowlists
  renderer/
    chat/           session list, messages, docked composer, useChat
    layout/         app chrome
    sandbox/        DynamicComponent bundle evaluator
    settings/       memory panel
    store/          Zustand app/chat stores
  shared/           local IPC/session message types pending shared package release
apps/playground/    component playground
docs/               architecture and migration docs
```

Retired concepts must stay retired: no `canvasStore`, `SlateCanvas`, canvas IPC channels, `ChatPanel`, or `@dnd-kit/*`.

---

## Runtime Boundaries

### Renderer

The renderer is a React app with Zustand state.

- `src/renderer/layout/AppLayout.tsx` is the root chat shell.
- `src/renderer/chat/useChat.ts` bridges chat state to Electron IPC.
- `src/renderer/chat/MessageList.tsx` renders markdown plus `MessageCard` bundles.
- `src/renderer/sandbox/DynamicComponent.tsx` evaluates trusted CJS bundles and injects `bridge` and per-component `store`.
- `src/renderer/store/chatStore.ts` holds active session messages, stream status, and attached cards.
- `src/renderer/store/appStore.ts` holds app-level UI state and user visual preferences.

### Main Process

The main process owns privileged work.

- `src/main/index.ts` installs the CSP and registers every IPC domain.
- `src/main/agent/ipc.ts` receives `agent:run`, resolves config, creates `AgentEngine`, and forwards AI SDK stream parts to renderer events.
- `src/main/agent/engine.ts` loads memory/context, classifies intent, and dispatches.
- `src/main/server/CSlateServerClient.ts` is the HTTP boundary to CSlate Server.
- `src/main/sessions/store.ts` persists conversation JSON.
- `src/main/memory/store.ts` persists user-visible memory files.

### Preload

`src/preload/channels.ts` is a hard allowlist. Any renderer-visible IPC channel must be listed here or calls/listeners fail at the bridge boundary.

---

## Turn Lifecycle

```text
User submits text
  -> useChat.submit()
  -> create session if needed
  -> session:append(user)
  -> session:auto-title on first user turn, fire-and-forget
  -> begin assistant draft in chatStore
  -> agent:run IPC
  -> AgentEngine.stream()
  -> agent:token deltas update assistant draft
  -> agent:card events attach inline cards to assistant draft
  -> agent:done finalizes draft
  -> session:append(assistant)
  -> session sidebar refresh
```

Important implementation detail: `agent:card` is emitted directly by skills/tools through `ctx.sender.send(...)`. It is not an AI SDK stream part handled by the normal stream-parts switch.

---

## Agent Dispatch

`AgentEngine.stream()` in `src/main/agent/engine.ts` is the top-level turn coordinator.

1. Compact old conversation context with `autoCompactIfNeeded`.
2. Load global user memory and active local components.
3. Classify the user message with `classifyIntent`.
4. Dispatch to one of four paths:
   - `render` → `runRenderSkill`
   - `build` → `Orchestrator`
   - `skill` → `component-search` or `component-fix`
   - `chat` → direct text response with no tools

The routing taxonomy lives in `src/main/agent/router.ts`:

- `render`: informational answer benefits from a visual card.
- `build`: user explicitly asks to build a new component.
- `skill`: operation on an already rendered card.
- `chat`: plain conversation.

All provider-specific LLM access goes through `@cslate/shared/agent`.

---

## Render Decision Loop

The render path is implemented in `src/main/agent/skills/render-decision/`.

```text
router says render
  -> classifyRenderType()
  -> if classifier says no: plainChat()
  -> search CSlate Server with semantic query
  -> if best score >= 0.82: fetch bundle.js and emit agent:card
  -> otherwise delegate to Orchestrator to generate a new component
```

Key constants:

- `RENDER_SCORE_THRESHOLD = 0.82`
- `SEARCH_LIMIT = 5`

The server-library fast path should stay fast and boring: search, fetch source, verify `bundle.js` exists, attach the card. Generation is the fallback, not the first choice.

---

## Component Generation

`src/main/agent/orchestrator/index.ts` controls generated components.

Current workflow:

1. Understand the user request.
2. Search community blueprints and local components.
3. Plan a component with `componentId`, requirements, contract, and file tasks.
4. Dispatch build sub-agents in parallel.
5. Assemble files, validate `manifest.json`, write to disk, bundle with esbuild.
6. Emit `agent:card` so the generated component appears inline.
7. Clear staging state.

The orchestrator persists partial build state in `.agent-staging/` so interrupted builds can resume. The `prepareStep` callback enforces phase order; do not weaken this unless you replace it with an equally deterministic control mechanism.

`writeComponent` writes to `components/{componentId}/`, validates with `validateComponentPackage`, runs the local esbuild bundler, then returns `bundle.js`. It does not place anything on a canvas.

---

## Component Runtime Contract

Cards are CJS bundles evaluated by `DynamicComponent`.

Allowed imports from the bundle:

- `react`
- `react-dom`
- `react/jsx-runtime`
- `react/jsx-dev-runtime`
- `bridge`

Everything else throws. There is no iframe and no real browser sandbox. The trust model is:

1. Server bundles passed review before serving.
2. Local generated bundles passed local validation and esbuild.
3. The CSP allows `unsafe-eval` because bundles run via `new Function()`.

Do not pipe arbitrary URLs, pasted code, or unreviewed third-party bundles into `DynamicComponent`.

The injected bridge currently supports:

- `bridge.user` with live theme, density, and preference data.
- `bridge.pipeline()` and `bridge.pipelineSubscribe()` via main-process pipeline IPC.
- Placeholder `fetch`, `subscribe`, and `getConfig` methods that warn and return no real external data yet.

---

## Persistence

### Sessions

Sessions live under `~/.cslate/sessions/{uuid}.json` and use local `src/shared/agentTypes.ts` types. These mirror planned `@cslate/shared` types but are intentionally local until the shared package formally owns them.

### Memory

Global memory lives under `~/.cslate/memory/`. It is user-visible and editable in Settings. `loadUserMemory()` injects it into render-decision and chat prompts so it affects output.

### Config

Config uses `electron-store`. Sensitive keys are encrypted with Electron `safeStorage`:

- `llmApiKey`
- `serverApiKey`
- `gatewayApiKey`

Read config in the main process through `getConfigValue()` or `resolveLLMConfig()`.

---

## Architecture Decisions

### ADR-C1: Chat portal over canvas

The product is a conversation-first LLM client. Canvas-era concepts were removed because they created a second mental model and complicated every agent path. New UI should attach to messages unless there is a future product decision to add a separate surface.

### ADR-C2: Visuals are opportunistic

The assistant should render only when a card materially improves the answer. The classifier is biased toward visuals for data, status, tracking, maps, timelines, and comparisons; plain chat remains valid for conceptual answers and settings help.

### ADR-C3: Server library before generation

Rendering should search the server first. Library hits are faster, safer, and improve consistency. Generation is reserved for no-match cases and explicit build requests.

### ADR-C4: Cards attach via `agent:card`

Cards are emitted as Electron events rather than stream parts. This keeps card rendering independent from AI SDK stream shape and lets tools/skills attach cards at the moment a bundle is ready.

### ADR-C5: Shared agent infra lives in `@cslate/shared/agent`

Provider registry construction, AI SDK wrappers, structured generation, sub-agent execution, compaction, result budgeting, and fence stripping are shared. Do not fork provider behavior in the client unless it is client-specific.

### ADR-C6: Bundle evaluation is trusted, not sandboxed

`DynamicComponent` is intentionally lightweight for speed and React integration. Security depends on the server review pipeline and local validation. Any change that broadens allowed imports or data access must be reviewed as a security decision.

### ADR-C7: IPC is explicit

Every renderer-visible channel must be added to `channels.ts`. This is deliberate friction: it prevents accidental expansion of the preload surface.

### ADR-C8: The app shell is an ambient reading surface

The main UI should follow `docs/design-manifesto-v2.md` and `docs/design-system-v2.md` without becoming decorative. CSlate should feel friendly, calm, and visually alive: a soft app shell, a generous composer, readable message typography, provider-colored accents, and lightly framed cards. Avoid bringing back dashboard density, canvas controls, exposed agent internals, or ornamental effects that distract from the conversation.

---

## Development Rules

- Keep changes chat-portal-first; do not reintroduce canvas-era files or channels.
- Add or update IPC allowlist entries with any new IPC handler/listener.
- Keep server HTTP behavior behind `CSlateServerClient`.
- Keep cross-repo contracts in `@cslate/shared` unless they are purely client IPC/session internals.
- Prefer small, deterministic tools over asking the main model to infer filesystem or build state.
- Validate generated components locally before rendering them.
- If a doc and code disagree, treat code as truth, update the doc, and call out the mismatch.

---

## Known Gaps

- Auto-publish of generated components is not currently wired end-to-end in the live client. Generated cards render locally; server upload/review needs a deliberate workflow before re-enabling.
- `bridge.fetch`, `bridge.subscribe`, and `bridge.getConfig` are placeholders. Live data currently flows through pipeline methods.
- Shared `AgentMessage` and `Session` schemas are still local in `src/shared/agentTypes.ts`.
- Existing historical docs may mention canvas-era modules; prefer this guide and `docs/migration-plan.md` for current product posture.

---

## Validation Commands

```bash
npm test
npm run typecheck
npm run build
npm run playground
```

Start with focused Vitest files near the code being changed, then run broader checks before release.
