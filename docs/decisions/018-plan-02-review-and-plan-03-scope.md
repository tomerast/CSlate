# 018 — Plan 02 Review & Plan 03 Scope

**Date:** 2026-03-28
**Status:** Resolved (Plan 03 shipped 2026-03-30)
**Context:** Post-merge review of Plan 02 (agent architecture + host renderer UI). Documents what works, what needs fixing before Plan 03, and what Plan 03 must deliver.

---

## What Plan 02 delivered

- **Core loop working**: ⌘K → describe → Haiku generates JSX → Babel compiles → renders on canvas
- **Iteration working**: current component code injected into LLM context on follow-up messages
- **Agent architecture scaffolded**: `AgentRunner`, `SkillRegistry`, `ToolRegistry`, `MemoryManager`, `LLMClient` abstraction — designed for future skills/tools/MCP even though only `ComponentBuilderSkill` is live
- **IPC layer**: `config:get/set` with `safeStorage` encryption; `agent:generate` handler
- **Renderer UI**: `ApiKeySetup` → `AppLayout` with drag region, `SlateCanvas`, `CommandBar`, `ChatPanel`
- **CSP fix**: `'unsafe-inline'` in `script-src` for dev mode (Vite React Refresh preamble was blocked)

---

## Known bugs to fix before or during Plan 03

These were found in the Plan 02 code review (see tomerast/CSlate#2) and are not blocking Plan 03 but should be addressed early:

### Critical (breaks correctness in normal use)

**1. User message duplicated in LLM history** — ✅ Fixed in Plan 03
History is now snapshotted before `addMessage()`. Regression test added (`src/renderer/__tests__/useChat.test.ts`).

**2. Markdown fences not stripped from LLM output** — ✅ Fixed in Plan 03
`stripFences()` utility applied in `renderComponent` and `writeComponent` tools before code reaches Babel or disk.

**3. `ErrorBoundary` caught state never resets** — ✅ Fixed in Plan 03
Added `key={code}` to `ErrorBoundary` so it remounts when code changes.

### Security

**4. Agent file tools — no path restriction** — ✅ Fixed in Plan 03
`ReadFileTool`/`WriteFileTool` don't exist as separate files. Path traversal protection added to `readProjectContext.ts`. Other tools (`readManifest`, `writeComponent`) already had it.

**5. `file:read`/`file:write` in preload allowlist with no handlers** — Deferred
These channels have registered handlers in `src/main/ipc/file.ts` (added in Plan 02). They work correctly.

### Minor (code quality)

**6. Dead code `throw` in `SkillRegistry`** — ✅ Fixed in Plan 05
The old try/catch pattern was replaced with a clean object-literal registry in the agent engine rewrite.

**7. Misleading "v1" comments on stub skills** — ✅ Fixed in Plan 05
Old stub files (`BlueprintSearch.ts`, `StateWirer.ts`) replaced with real skill implementations in the agent engine rewrite.

**8. `bridge:fetch` in both send and invoke channel lists** — ✅ Fixed in Plan 03
Removed `bridge:fetch` from `ALLOWED_INVOKE_CHANNELS`. It correctly remains in `ALLOWED_SEND_CHANNELS` only.

---

## What Plan 03 delivered

**A. `ComponentBlueprint` Zod schema** — ✅ Shipped
Created at `src/shared/blueprintTypes.ts` (local to client, not in `@cslate/shared`). Includes `ComponentBlueprintSchema` and `SearchResultSchema` with full Zod validation.

**B. `searchBlueprints` tool refactored** — ✅ Shipped
The `searchBlueprints` agent tool now delegates to `CSlateServerClient` instead of raw `fetch`. The `component-search` skill was already implemented in Plan 05's agent engine rewrite.

**C. Server integration — `CSlateServerClient`** — ✅ Shipped
`src/main/server/CSlateServerClient.ts` wraps search, publish, and fetchSource endpoints. IPC handlers at `src/main/ipc/server.ts` expose `server:search` and `server:publish` channels.

**D. Publish flow** — ✅ Shipped
`PublishToast` component shows after component accept: "Share with the CSlate community?" with [Share]/[Not now]. State managed via `publishState` in chatStore.

**E. Three critical bugs fixed** — ✅ Shipped
See items 1–3 above.

### Deferred to Plan 04+

- Sub-agent orchestration (multi-turn agent with sub-tasks)
- MCP tool execution (tools are registered but not invoked from skills)
- `StateWirer` skill (Zustand state wiring between components)
- Multi-component canvas (multiple components on one slate)
- Import/dependency resolution in `DynamicComponent` (currently no npm imports allowed)

---

## Architecture (as implemented)

### Server client placement
`src/main/server/CSlateServerClient.ts` — main process only. Renderer communicates via IPC (`server:search`, `server:publish`).

### Blueprint schema placement
`src/shared/blueprintTypes.ts` — accessible by both main and renderer via `@shared` alias.

### Agent tool flow
`AgentEngine` creates a `CSlateServerClient` from config, passes it to `createSearchBlueprintsTool()`. The `component-builder` skill calls `searchBlueprints` tool to find community blueprints before generating.

### Known remaining items (deferred to Plan 04+)
- `projectDir` is still empty string from `useChat.ts` — memory falls back to `~/.cslate/agent/memory`
- `file:read`/`file:write` IPC channels exist and have handlers but are separate from agent tool file access
- Publish toast sends hardcoded "Untitled Component" — needs name input UI

---

## File locations (final)

| File | Purpose | Status |
|------|---------|--------|
| `src/shared/blueprintTypes.ts` | `ComponentBlueprint` Zod schema | ✅ Created |
| `src/main/server/CSlateServerClient.ts` | HTTP client for CSlate-Server | ✅ Created |
| `src/main/ipc/server.ts` | IPC handlers for `server:search`, `server:publish` | ✅ Created |
| `src/main/agent/tools/searchBlueprints.ts` | Delegates to CSlateServerClient | ✅ Refactored |
| `src/main/agent/lib/stripFences.ts` | Markdown fence stripping utility | ✅ Created |
| `src/renderer/chat/PublishToast.tsx` | Post-accept publish toast | ✅ Created |
| `src/renderer/sandbox/DynamicComponent.tsx` | ErrorBoundary key fix | ✅ Fixed |
| `src/preload/channels.ts` | Added server channels, removed duplicate | ✅ Fixed |
