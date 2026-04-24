# CSlate Client — Implementation Spec

**Repo:** `CSlate` (Electron + React + TypeScript)  
**Date:** 2026-04-24

---

## Overview

The CSlate client is the desktop app. Its job is to:

1. Provide a beautiful chat interface for users to talk to LLMs
2. Automatically render LLM responses as UI cards when appropriate
3. Manage component fetching, local generation, and upload to the server
4. Persist user memory and preferences across sessions and provider switches

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 30 |
| Build | electron-vite 2 + Vite 5 |
| Language | TypeScript 5.9 strict |
| UI framework | React 18 |
| Styling | Tailwind CSS 3 (semantic tokens only — no raw color utilities) |
| State | Zustand 4 (`chatStore`, `canvasStore`, `appStore`) |
| AI SDK | Vercel AI SDK v6 (`ai`) |
| LLM providers | `@ai-sdk/anthropic` `@ai-sdk/openai` `@ai-sdk/google` `ollama-ai-provider` |
| Agent infrastructure | `@cslate/shared/agent` — `buildRegistry`, `runAgentStream`, `runSubAgent`, `runStructuredAgent` |
| Component bundler | esbuild 0.27 (CJS, react/react-dom externalized) |
| Drag & drop | `@dnd-kit/core` |
| Markdown | `react-markdown` |
| Config store | `electron-store` 8 (sensitive fields via `safeStorage`) |
| Logger | `pino` 10 (main process) |
| Tests | Vitest 1 + `@testing-library/react` |
| Shared contracts | `@cslate/shared` from `github:tomerast/CSlate-shared#main` |

---

## Source Layout

```
src/
  main/
    agent/
      engine.ts           AgentEngine — intent routing + dispatch to orchestrator/skill/action
      router.ts           Intent classifier (runStructuredAgent)
      orchestrator/       Orchestrator — multi-phase streamText loop
      skills/             Legacy skill registry (buildSkillRegistry)
      tools/              AI SDK tool definitions (buildToolSet)
      actions/            Direct action handlers (no LLM call) — actionRegistry
      memory/             readMemory(), writeMemoryEntry() — ~/.cslate/memory/*.md
      prompts/            System prompt fragments
      lib/                Internal helpers
    ipc/                  IPC handler registrations (one file per domain)
    server/               CSlateServerClient — typed HTTP wrapper for CSlate-server
    pipeline/             Local esbuild bundle pipeline
    lib/
      store.ts            electron-store (encrypted sensitive fields)
      paths.ts            safePath(), safeComponentId()
      logger.ts           pino logger, log modules
    index.ts              Electron main entry
    windowManager.ts      BrowserWindow lifecycle

  preload/
    index.ts              contextBridge setup
    channels.ts           Allowed IPC channel names (ALL new channels must be added here)

  renderer/
    chat/
      ChatPanel.tsx       Conversation view — message list + input
      MessageList.tsx     Renders messages + inline UI cards
      FloatingChatBar.tsx Input bar
      useChat.ts          Chat state + agent streaming hook
      PublishToast.tsx    Upload/review progress notification
    canvas/
      SlateCanvas.tsx     Standalone canvas mode (secondary)
      hooks/              useResize, useDrag, useAutoSize, ...
    sandbox/
      DynamicComponent.tsx  esbuild CJS eval + ErrorBoundary
    store/
      chatStore.ts        Messages, streaming state
      canvasStore.ts      Canvas component positions + hydrate()
      appStore.ts         Provider config, app-level state
    layout/
      AppLayout.tsx       Root layout — tabs (chat / canvas)
    App.tsx

  shared/
    agentTypes.ts         IPC types: AgentRequest, AgentResponse — NOT in @cslate/shared
```

---

## Agent Dispatch (engine.ts)

`AgentEngine.stream()` runs this sequence on every user turn:

```
1. autoCompactIfNeeded — trim conversation if approaching context limit
2. readMemory + loadActiveComponents — parallel
3. classifyIntent (runStructuredAgent) → route: action | orchestrator | skill | direct
4. Dispatch:
   ├── action      → actionRegistry[name]()  — no LLM, instant
   ├── orchestrator → Orchestrator.stream()  — multi-phase tool loop (runAgentStream)
   ├── skill       → buildSkillRegistry()[name] via runAgentStream
   └── direct      → runAgentStream with no tools, simple response
5. writeSessionMemory after orchestrator runs
```

All LLM calls go through `@cslate/shared/agent`:
- `runAgentStream` — wraps `streamText`, supports `prepareStep` for phase-based routing
- `runSubAgent` — wraps `generateText` for expert sub-agents with tool loops
- `runStructuredAgent` — wraps `generateObject` for classifier + structured decisions
- `buildRegistry(config)` — single `ProviderRegistry` for all 4 providers

---

## LLM Configuration (LLMConfig)

Defined in `@cslate/shared/agent`:

```typescript
interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'local'
  model: string
  apiKey?: string       // encrypted via safeStorage
  baseUrl?: string      // for Ollama / custom gateway
  fastModel?: string    // faster model for classifier + sub-agents
}
```

Fast model defaults (from `fastModelId(config)`):
- `anthropic` → `claude-haiku-4-5-20251001`
- `openai` → `gpt-4o-mini`
- `google` → `gemini-1.5-flash`
- `local` → same as main model

**OpenAI gotcha:** `buildRegistry` patches OpenAI to use `p.chat(id)` (Chat Completions) not the Responses API — required for gateway compatibility.

**Ollama gotcha:** `ollama-ai-provider` returns ProviderV1; cast to ProviderV3 for registry.

---

## IPC Contract (Renderer ↔ Main)

All channels must be declared in `src/preload/channels.ts` or `invoke()` throws silently.

Key channels:

| Channel | Direction | Description |
|---|---|---|
| `agent:stream` | main → renderer | Streaming token/delta chunks |
| `agent:card` | main → renderer | Inline card bundle ready to render |
| `agent:complete` | main → renderer | Turn complete signal |
| `agent:send` | renderer → main | User sends a message |
| `agent:cancel` | renderer → main | Cancel current stream |
| `canvas:load` | renderer → main | Load canvas component list |
| `canvas:add` | renderer → main | Add component to canvas |
| `component:upload` | renderer → main | Trigger server upload |
| `upload:progress` | main → renderer | SSE review stage events forwarded |
| `config:get` | renderer → main | Read a config value |
| `config:set` | renderer → main | Write a config value |

---

## Component Execution (DynamicComponent)

Components are esbuild CJS bundles. Execution in renderer:

```typescript
const require = (mod: string) => {
  const shim = { react: React, 'react-dom': ReactDOM }
  if (shim[mod]) return shim[mod]
  throw new Error(`Module "${mod}" not available in component sandbox`)
}
const module = { exports: {} as any }
new Function('require', 'module', 'exports', bundleCode)(require, module, module.exports)
const Component = module.exports['default']
```

**Rules (enforced at generation + review time):**
- Entry file always `ui.tsx`, default export is the component
- `react` and `react-dom` are the only allowed external imports
- No `fetch`, `XMLHttpRequest`, `WebSocket` — data arrives via props (manifest `inputs`)
- All Tailwind must use semantic tokens (`bg-primary`, `text-muted`, `border-border`, etc.)
- esbuild target: CJS, `bundle: true`, react/react-dom external

---

## Memory System

`readMemory(projectDir)` loads from `~/.cslate/memory/` (falls back gracefully if missing).

| File | Written By | Content |
|---|---|---|
| `MEMORY.md` | auto | Index |
| `user_preferences.md` | agent | Visual/data style preferences |
| `domain_context.md` | agent | User's work domain |
| `componentHistory` entries | `writeSessionMemory()` | `[timestamp] summary (N tokens)` |

Injected into system prompt on every turn. Users can view + edit in Settings → Memory.

---

## Build Commands

```bash
npm run dev          # Electron dev (renderer hot reload + main inspect on :9229)
npm run dev:full     # Full stack (Electron + Docker: postgres + minio + mailhog)
npm run dev:stop     # Stop docker compose + kill electron-vite
npm run dev:logs     # Tail docker compose logs
npm test             # Vitest run
npm run typecheck    # TypeScript check (client + playground)
npm run playground   # Component playground at localhost:5174
npm run db:reset     # Via docker exec → server's db:reset
npm run db:migrate   # Via docker exec → server's db:migrate
npm run db:studio    # Via docker exec → Drizzle Studio
```

## Logs (Main Process)

```bash
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq .
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq 'select(.module == "engine")'
tail -f /tmp/cslate-$(date +%Y-%m-%d).log | jq 'select(.module == "intent")'
```

Log modules: `agent`, `engine`, `intent`, `providers`, `server`  
Renderer errors → DevTools (Cmd+Option+I)

---

## Gotchas

- IPC channels must be in `src/preload/channels.ts` — missing channel = silent failure
- All file paths go through `safePath()` / `safeComponentId()` — throws on traversal
- `canvas:load` called at startup with empty `projectDir` — handle gracefully (hydrate even with empty array)
- OpenAI structured outputs: all schema properties must be `required`; use `.nullable()` not `.optional()`
- esbuild bundle format is CJS; entry must be `ui.tsx`; default export at `module.exports['default']`
- `safeStorage` only works in packaged Electron — dev falls back to plain electron-store
- `autoCompactIfNeeded` runs before every turn — conversation history may be silently trimmed
