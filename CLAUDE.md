# CSlate — Claude Code Context

CSlate is an Electron desktop app where an AI agent builds and manages React components on a visual canvas. Users describe what they want in a chat bar; the agent writes, bundles, and renders components live.

## Architecture

```
src/
  main/       Node.js Electron main process
    agent/    AI agent engine (LLM + tools + skills)
    ipc/      IPC handler registrations
    lib/      store.ts (electron-store), paths.ts (safePath), logger.ts (pino)
    server/   CSlateServerClient (HTTP)
  preload/    contextBridge — channels.ts defines allowed IPC channels
  renderer/   React app
    canvas/   SlateCanvas — renders persisted + preview components
    chat/     CommandBar, ChatPanel, useChat, PublishToast
    sandbox/  DynamicComponent (esbuild CJS eval + ErrorBoundary)
    store/    chatStore, canvasStore, appStore (Zustand)
    settings/ Config panel
  shared/     agentTypes.ts, blueprintTypes.ts (shared main + renderer)
```

## Key Patterns

**IPC**: Renderer → `window.electron.invoke(channel, args)` → main handler. Channels must be listed in `src/preload/channels.ts`.

**Agent tools**: Each tool in `src/main/agent/tools/` exports a `create*Tool(context)` factory returning an AI SDK `tool()`. Registered in `src/main/agent/tools/index.ts`.

**Agent skills**: Each skill in `src/main/agent/skills/` exports `run*(ctx, config, registry)`. Selected by intent classifier (`src/main/agent/intent.ts`). Skill prompts use fragments from `src/main/agent/prompts/fragments.ts`.

**Canvas flow**: `renderComponent` tool → preview on canvas → user approves → `writeComponent` tool → persisted to disk + canvas.json + bundle.js → `canvasStore.addComponent()`.

**Component bundles**: esbuild CJS format, react/react-dom externalized. Stored at `projectDir/components/{id}/bundle.js`. Executed via require-shim in `DynamicComponent.tsx`.

**Config store**: Sensitive keys (`llmApiKey`, `serverApiKey`, `gatewayApiKey`) encrypted via `safeStorage`. Read via `getConfigValue(key)` from `src/main/ipc/config.ts`.

## Commands

```bash
npm run dev          # Electron only
npm run dev:full     # Full stack (Electron + Docker sidecar)
npm run dev:stop     # Stop everything
npm test             # Vitest unit tests
npm run typecheck    # TypeScript check
npm run playground   # Component playground at localhost:5174
```

## Logs (main process)

```bash
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq .
# or filter by module:
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq 'select(.module == "engine")'
```

Log modules: `agent` (IPC), `engine` (streamText), `intent` (classifier), `providers` (registry).
Renderer errors → Electron DevTools (Cmd+Option+I).

## Testing

Tests live in `__tests__/` next to source. Run with `vitest run`. No Electron needed.

## Environment

```
.env.development         Live config (gitignored)
.env.development.example Template
```

Key env vars: `ANTHROPIC_API_KEY`, `VITE_SERVER_URL`.

## Shared package

`@cslate/shared` — `ComponentManifest` Zod schema + `validateComponentPackage()`. Published to npm. Source: `~/Projects/CSlate-shared`.

## Docs

- Architecture decisions: `docs/decisions/`
- API contract: `docs/contracts/server-api-contract.md`
- Design specs: `docs/superpowers/specs/`

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

This policy prevents agents from stopping on fixable issues and ensures cross-cutting changes are surfaced in reports for review.

## Gotchas

- IPC channels must be in `src/preload/channels.ts` or invoke throws
- All file paths go through `safePath()` / `safeComponentId()` — throws on traversal
- `canvas:load` called at startup with empty projectDir — handle gracefully
- OpenAI structured outputs: all schema properties must be `required`; use `.nullable()` not `.optional()`
- esbuild bundle format is CJS; entry must be `ui.tsx`; default export accessed as `module.exports['default']`
