# CSlate — Codex Context

CSlate is a desktop chat portal for LLMs. Users open the app, pick a model, and talk. When an answer would be clearer as a visual, the agent silently decides to render a live React card inline in the assistant message — either fetched from the community library on the CSlate server, or generated on the spot and uploaded for the next person. Canvases and dashboards have been retired. See `docs/spec.md` for the product vision and `docs/migration-plan.md` for how we got here.

## Architecture

```
src/
  main/            Electron main process
    agent/         AI agent engine
      engine.ts    Top-level stream — routes to render / build / skill / direct
      router.ts    Intent classifier (render | build | chat | skill)
      skills/
        render-decision/   The core loop: classify → server search → card OR generate
        component-search   Browse library
        component-fix      Iterate on a rendered card
      orchestrator/        Builds new components, emits agent:card on success
      tools/               readFile / grep / writeComponent / validateManifest / …
      memory/              Per-project memory (agent-internal)
      config-resolver.ts   LLMConfig loader shared by agent:run and session:auto-title
    memory/        Global user memory (~/.cslate/memory/*.md) — what the user sees
    sessions/      Session persistence (~/.cslate/sessions/{uuid}.json)
    ipc/           IPC handler registrations (session, memory, config, …)
    server/        CSlateServerClient
  preload/         contextBridge — channels.ts allowlist
  renderer/
    chat/
      AppLayout integration · SessionList · DockedChatBar · MessageList · useChat · sessions-api
      render-decision cards arrive via 'agent:card' and attach to the streaming message
    layout/        AppLayout + Header
    sandbox/       DynamicComponent (CJS eval + ErrorBoundary + bridge.user personalization)
    settings/      MemoryPanel (global memory editor)
    store/         chatStore (session-aware) · appStore (prefs + panel state)
  shared/          AgentMessage / MessageCard / Session types (mirror @cslate/shared v0.4)
```

## Key Patterns

**IPC**: Renderer → `window.electron.invoke(channel, args)` → main handler. Channels must be listed in `src/preload/channels.ts`.

**Session flow**: first user message → `session:create` → `session:append(user)` → fire-and-forget `session:auto-title` → `agent:run` → `agent:token` deltas stream into a draft assistant message → `agent:card` attaches cards → `agent:done` → `session:append(assistant)` → sidebar refresh.

**Render-decision loop**: router returns `render` → `runRenderSkill` classifies (shouldRender / renderType / searchQuery) → server search with threshold `0.82` → on hit emit `agent:card` + stream intro text; on miss delegate to orchestrator which builds a new component and emits its own `agent:card` from inside `writeComponent`.

**Agent skills**: each skill in `src/main/agent/skills/` exposes an entry generator yielding AI SDK stream parts. The router selects one; the engine pipes parts to `agent:token` / `agent:card` / `agent:done`.

**Memory**: global at `~/.cslate/memory/`. `user_preferences.md` is seeded on first read and automatically injected into the render-decision system prompt and the plain-chat system prompt so preferences actually steer output.

**Component bundles**: esbuild CJS, react/react-dom externalized, bundle.js lives at `projectDir/components/{id}/bundle.js`. `DynamicComponent` evals via a require-shim. `variant: 'inline'` constrains to message-bubble width with scroll; `'fullscreen'` for future full-screen embeds.

**Sandbox bridge**: cards receive `bridge = { user: { theme, density, preferences }, fetch, pipeline, pipelineSubscribe, … }`. `bridge.user` reflects `useAppStore().preferences` live — cards re-render when theme flips.

**Config store**: sensitive keys (`llmApiKey`, `serverApiKey`, `gatewayApiKey`) encrypted via `safeStorage`. Read via `getConfigValue(key)` from `src/main/ipc/config.ts` or `resolveLLMConfig()` in `src/main/agent/config-resolver.ts`.

## Commands

```bash
npm run dev          # Electron only
npm run dev:full     # Full stack (Electron + Docker sidecar)
npm run dev:stop     # Stop everything
npm test             # Vitest unit tests (41 files · 293 tests)
npm run typecheck    # tsc --noEmit
npm run build        # electron-vite build
npm run playground   # Component playground at localhost:5174
```

## Keyboard

- `⌘B` — toggle session sidebar
- `⌘,` — settings
- `⌘M` — memory panel
- `Enter` — send message · `Shift+Enter` — newline

## Logs (main process)

```bash
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq .
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq 'select(.module == "engine")'
```

Log modules: `agent` (IPC), `engine` (dispatch), `render-decision`, `auto-title`, `providers`.
Renderer errors → DevTools (⌘⌥I).

## Testing

Tests live in `__tests__/` next to source. Run with `vitest run`. No Electron needed.

## Environment

```
.env.development         Live config (gitignored)
.env.development.example Template
```

Key env vars: `ANTHROPIC_API_KEY`, `VITE_SERVER_URL`, `CSLATE_SERVER_URL`.

## Shared package

`@cslate/shared` — manifest schemas + agent runtime. Source: `~/Projects/CSlate-shared`. The new `AgentMessage` / `Session` schemas mirror in `src/shared/agentTypes.ts` until `@cslate/shared` v0.4 ships those types formally.

## Agent Dispatch Rules

When dispatching implementer subagents for this project, always include this section in their prompt:

```
## Fix-First Policy

When you encounter an issue **within the scope of your task**, fix it and keep going — do not stop and ask. This includes:
- TypeScript errors in files you created or modified
- Test failures caused by your changes
- Missing imports or deps that your implementation requires
- Lint / build errors introduced by your work
- Runtime gotchas you discover while testing (e.g. a missing IPC channel, a CSP directive needed by a component you're building)

**Cross-cutting side-effects** (changes to files outside your task's File Map) must be made if needed but flagged explicitly in your report under "Side effects". Examples: adding a channel to `channels.ts` because your component needs it, adding `unsafe-eval` to the CSP because you're using `new Function()`.

Only escalate (BLOCKED / NEEDS_CONTEXT) when:
- The fix requires redesigning something outside your task scope
- You genuinely don't know how to fix it after investigating
- The fix would contradict or expand the plan's intent
```

## Gotchas

- IPC channels must be in `src/preload/channels.ts` or invoke throws
- All file paths go through `safePath()` / `safeComponentId()` — throws on traversal
- OpenAI structured outputs: all schema properties must be `required`; use `.nullable()` not `.optional()`
- esbuild bundle format is CJS; entry must be `ui.tsx`; default export accessed as `module.exports['default']`
- Canvas code has been deleted — do not reintroduce `canvasStore`, `SlateCanvas`, `ChatPanel`, `@dnd-kit/*`, or `canvas:*` IPC channels
- `agent:card` events are emitted directly by skills via `ctx.sender.send(...)`, not through the stream-parts switch in `agent/ipc.ts`
- Auto-title fires on the very first user message per session (see `useChat.submit`). Retrigger by renaming manually or deleting the session.

## Migration History

The app was pivoted from a canvas-first component builder to a chat portal in April 2026. Phases 1–6 are live:

- **Phase 1** — canvas + dnd-kit + canvas-era skills deleted
- **Phase 2** — chat foundation: AgentMessage, Session, SessionList, DockedChatBar, useChat
- **Phase 3** — inline card rendering with `DynamicComponent` variant + bridge.user
- **Phase 4** — render-decision router + skill + classifier tests
- **Phase 5** — auto-title, fork-from-message, regenerate-last
- **Phase 6** — global memory store + MemoryPanel + memory-driven prompts

See `docs/migration-plan.md` for the full per-task breakdown and acceptance criteria.
