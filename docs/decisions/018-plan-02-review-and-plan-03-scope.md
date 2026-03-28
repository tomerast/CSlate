# 018 — Plan 02 Review & Plan 03 Scope

**Date:** 2026-03-28
**Status:** Decided
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

**1. User message duplicated in LLM history** (`src/renderer/chat/useChat.ts:11,18`)
`addMessage(...)` is called before `messagesRef.current.slice(-6)` is read. Zustand `set()` is synchronous, so the just-added user message is already in the ref. `ComponentBuilderSkill` also appends it explicitly — every request sends the current user message twice.
**Fix:** Snapshot history before calling `addMessage`, or read from the store state before the mutation.

**2. Markdown fences not stripped from LLM output** (`src/main/agent/skills/ComponentBuilder.ts:48`)
`componentCode: llmResponse.content` is returned raw. If the model wraps its response in ` ```jsx ... ``` `, Babel fails to parse it and the canvas shows a compile error.
**Fix:** Strip ` ```jsx ` / ` ``` ` fences before returning `componentCode`.

**3. `ErrorBoundary` caught state never resets** (`src/renderer/sandbox/DynamicComponent.tsx:50-77`)
After a runtime crash, `caught = true` persists in the `ErrorBoundary` instance even when new valid code arrives. The canvas shows nothing forever after the first runtime error.
**Fix:** Add a `key={code}` prop to `ErrorBoundary` so it remounts when code changes.

### Security (real issues, low immediate exploitability since tools aren't wired yet)

**4. `ReadFileTool` / `WriteFileTool` — no path restriction** (`src/main/agent/tools/ReadFileTool.ts:14-20`, `WriteFileTool.ts:16-23`)
The LLM can instruct the agent to read or write any file on the system. Prompt injection in user input could exfiltrate secrets.
**Fix:** Resolve path against `request.projectDir` and reject anything outside it. Tools are not yet invoked from skills, so this is safe for now but must be fixed before tools are enabled.

**5. `file:read` / `file:write` in preload allowlist with no handlers** (`src/preload/channels.ts:11-15`)
These channels are advertised as callable but have no `ipcMain.handle()` registrations. Calls will silently hang.
**Fix:** Either remove from `ALLOWED_INVOKE_CHANNELS` until handlers are implemented, or add scoped handlers.

### Minor (code quality)

**6. Dead code `throw` in `SkillRegistry`** (`src/main/agent/skills/index.ts:16-20`)
`throw new Error('No skill found')` is unreachable because `ComponentBuilderSkill.canHandle()` always returns `true`. Remove it or add a comment explaining it's guarded by the catch-all.

**7. Misleading "v1" comments on stub skills** (`StateWirer.ts:4`, `BlueprintSearch.ts:4`)
Comments say "v1: analyzes component manifests / searches community DB" but implementations are stubs. Change to "TODO" or "stub — implement in Plan 03."

**8. `bridge:fetch` in both send and invoke channel lists** (`src/preload/channels.ts:2,10`)
Same channel in two lists with no handler registered for either. Likely legacy scaffolding. Remove or clarify intent.

---

## What Plan 03 must deliver

### Mandatory for the next phase to be useful

**A. `ComponentBlueprint` Zod schema in `@cslate/shared`**
The shared type system needs a structured blueprint type: `id`, `title`, `description`, `tags`, `source` (JSX string), `dependencies` (list of npm packages the component uses), `manifest` (version, author). Both client and server will validate against this. Enables cataloging, search, and display.

**B. `BlueprintSearchSkill` — real implementation**
Hit the CSlate-Server `GET /api/components/search` endpoint with the user's natural-language description. Return the top 3 matches as context to `ComponentBuilderSkill`. The agent flow becomes: describe → search → generate (with blueprint as starting point or reference).

**C. Server integration — `CSlate-Server` client**
Thin HTTP client (`src/main/server/CSlateServerClient.ts`) that wraps the search, fetch-source, and publish endpoints. Handles auth token, base URL from config, error handling. Used by `BlueprintSearchSkill` and the future publish flow.

**D. Publish flow**
After a component is built, the user can name it and publish to the community DB. Requires: name input in UI, `POST /api/components` with the blueprint, response shown in chat panel.

**E. Fix the three critical bugs from Plan 02 review** (items 1–3 above) before Plan 03 ships.

### Deferred to Plan 04+

- Sub-agent orchestration (multi-turn agent with sub-tasks)
- MCP tool execution (tools are registered but not invoked from skills)
- `StateWirer` skill (Zustand state wiring between components)
- Multi-component canvas (multiple components on one slate)
- Import/dependency resolution in `DynamicComponent` (currently no npm imports allowed)

---

## Architecture notes for Plan 03 implementer

### Server client placement
`src/main/server/` — main process only. Never imported by renderer. Renderer asks for data via IPC (`server:search`, `server:publish`), not by calling the server directly.

### Blueprint schema placement
`src/shared/blueprintTypes.ts` — accessible by both main and renderer via `@shared` alias. Keep it separate from `agentTypes.ts`. Use Zod for runtime validation on the main side.

### Skill flow for search + generate
```
AgentRunner.run(request)
  → SkillRegistry.resolve() → BlueprintSearchSkill (if no current code)
    → CSlateServerClient.search(request.message) → top 3 blueprints
    → pass to ComponentBuilderSkill as additional system context
  → ComponentBuilderSkill.execute(ctx, request)
    → LLM prompt includes blueprint references
    → returns new component code
```

### `projectDir` is never set — all memory is shared
`AgentRequest.projectDir` is optional and currently never populated from `useChat.ts`. All `MemoryManager` instances fall back to `~/.cslate/agent/memory`. Plan 03 should either pass a real project dir or remove the abstraction until it's needed.

---

## File locations

| File | Purpose |
|------|---------|
| `src/shared/blueprintTypes.ts` | `ComponentBlueprint` Zod schema (create in Plan 03) |
| `src/main/server/CSlateServerClient.ts` | HTTP client for CSlate-Server (create in Plan 03) |
| `src/main/ipc/server.ts` | IPC handlers for `server:search`, `server:publish` (create in Plan 03) |
| `src/main/agent/skills/BlueprintSearch.ts` | Replace stub with real implementation (Plan 03) |
| `src/renderer/chat/useChat.ts` | Fix double-message bug (Plan 03 — do first) |
| `src/main/agent/skills/ComponentBuilder.ts` | Fix markdown fence stripping (Plan 03 — do first) |
| `src/renderer/sandbox/DynamicComponent.tsx` | Fix ErrorBoundary reset (Plan 03 — do first) |
| `src/main/agent/tools/ReadFileTool.ts` | Add path restriction before enabling tools (Plan 03) |
| `src/main/agent/tools/WriteFileTool.ts` | Add path restriction before enabling tools (Plan 03) |
| `src/preload/channels.ts` | Remove dangling `file:read`/`file:write` or add handlers (Plan 03) |
