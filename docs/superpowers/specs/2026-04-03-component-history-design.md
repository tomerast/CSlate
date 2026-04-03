# Component History Feature Design

**Date:** 2026-04-03  
**Status:** Approved  

## Overview

Allow users to see all locally created components (their full history, even if removed from canvas), resume working on them, and restore the full conversation context so the agent can continue with complete background.

## Core Model

Chat is **session-scoped**. A session is a conversation that may touch one or more components. Sessions are first-class objects persisted to disk. Components reference their sessions via a sidecar file.

## Data Model

### Session file
**Path:** `{projectDir}/.cslate/sessions/{sessionId}.json`

```typescript
{
  id: string;                    // UUID
  createdAt: number;             // unix timestamp ms
  updatedAt: number;             // unix timestamp ms
  componentIds: string[];        // components touched in this session
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
}
```

### Component sidecar
**Path:** `components/{componentId}/session.json`

```typescript
{
  sessionIds: string[];          // ordered, latest last
}
```

`ComponentManifest` (from `@cslate/shared`) is not changed — all new data lives in sidecars.

### Session lifecycle
- A new session is created on the first user message when `activeSessionId === null`
- The orchestrator links sessionId ↔ componentId after `writeComponent` completes (it knows both the active sessionId from context and the componentId from the tool result)
- Switching to a component via the history panel loads its latest sessionId
- Auto-save: chatStore debounces `session:save` on every message (1s) and on `beforeunload`

## IPC Layer

**New file:** `src/main/ipc/sessions.ts`  
**Registered in:** `src/main/ipc/server.ts`  

| Channel | Type | Purpose |
|---|---|---|
| `session:create` | invoke | Create new session file, return sessionId |
| `session:save` | invoke | Persist messages + componentIds |
| `session:load` | invoke | Load session by ID, return messages |
| `session:list-for-component` | invoke | Return sessionIds for a component |
| `component:list-all` | invoke | Scan components dir, return all manifests + session metadata + canvas placement |

All 5 channels must be added to `src/preload/channels.ts`.

## UI

### ComponentHistoryPanel
- Self-contained panel component, same pattern as the config panel
- Triggered by **Cmd+H** keyboard shortcut and a toolbar button
- Toggle: same shortcut or clicking outside closes it

### Component entry (per component in panel)
- Name + description
- Tags (pill chips)
- Last edited date
- "On canvas" badge if currently placed in canvas.json
- Thumbnail placeholder (grey box — real screenshot capture is a future feature)
- **"Continue" button**

### Resume flow (Continue button)
1. If component not on canvas → IPC `canvas:add-component` with the componentId (reads existing bundle.js + manifest.json from disk, adds to canvas.json and canvasStore)
2. Flush current active session to disk (`session:save`)
3. Read `components/{id}/session.json` → get latest sessionId
4. `session:load` → hydrate chatStore messages
5. Set `activeSessionId` + `activeComponentIds` in chatStore
6. Open chat panel

## State (chatStore additions)

```typescript
activeSessionId: string | null;   // null = no session yet
activeComponentIds: string[];     // components linked to active session
```

- App start: `activeSessionId = null`
- First user message with no active session → `session:create` → set `activeSessionId`
- Resume from history → `session:load` → hydrate both fields

`conversationHistory` passed to the agent already reads from `messages` — no agent changes required.

## What Does NOT Change
- `ComponentManifest` / `@cslate/shared` — untouched
- `canvasStore` — still manages only currently-rendered components
- Agent tools (`writeComponent`, `renderComponent`) — unchanged; sessionId linking happens in the orchestrator after `writeComponent` returns
- esbuild bundling pipeline — untouched

## Out of Scope (future)
- Real component thumbnails (screenshot capture)
- "New chat" / explicit session reset UI
- Session search or filtering
- Multi-user / sync

## File Map

| File | Change |
|---|---|
| `src/main/ipc/sessions.ts` | **New** — all session IPC handlers |
| `src/main/ipc/server.ts` | Register sessions handlers |
| `src/preload/channels.ts` | Add 5 new channels |
| `src/renderer/store/chatStore.ts` | Add `activeSessionId`, `activeComponentIds`, auto-save logic |
| `src/renderer/components/component-history-panel/` | **New** — panel component |
| `src/renderer/App.tsx` | Mount panel, register Cmd+H shortcut, add toolbar button |
| `src/main/agent/orchestrator/` | Post-writeComponent: call `session:save` to link sessionId ↔ componentId |
