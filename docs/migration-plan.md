# CSlate Migration Plan — Canvas Retirement + Chat Portal Rebuild

**Audience:** engineers + dispatched agents working on the pivot
**Source of truth for product vision:** `docs/spec.md`
**Posture:** canvas is **retired**. CSlate is a chat portal. One surface, one mental model.

---

## 1. Product North Star

> CSlate is a portal for talking to any LLM, where every response is rendered as beautifully as the question deserves — personalized to the user, remembered across sessions, and delivered at the speed of a message.

The product is **three things**, in priority order:

1. **Conversation** — a chat interface that feels faster and more thoughtful than any other LLM client.
2. **Beautiful responses** — when an answer is better shown than told, the agent renders a live React card inline. Matching cards come from a community library; new ones are generated on the spot and shared back.
3. **Personal and persistent** — conversations are saved, searchable, and resumable. The agent remembers the user across sessions and adapts its output to their taste.

Anything that does not serve one of these three is out of scope.

---

## 2. What Retires

The canvas is not "kept as secondary." It is deleted. All code and dependencies below are removed in Phase 1 so the rest of the pivot has no legacy weight to drag.

### 2.1 Deleted source

```
src/renderer/canvas/                     # whole directory
src/renderer/store/canvasStore.ts
src/renderer/store/pipelineStore.ts      # pipeline-wiring UI state, canvas-era
src/renderer/chat/ChatPanel.tsx          # side-panel chat, obsolete
src/renderer/chat/FloatingChatBar.tsx    # canvas overlay input, obsolete

src/main/agent/skills/state-wirer.ts
src/main/agent/skills/pipeline-wirer.ts
src/main/agent/actions/clear-canvas.ts
src/main/agent/actions/remove-component.ts

# Canvas IPC handlers in:
src/main/ipc/project.ts                  # canvas:load / canvas:add-component / canvas:update-placement / canvas:remove-component
```

### 2.2 Deleted channels

From `src/preload/channels.ts`:

- `canvas:load`, `canvas:add-component`, `canvas:update-placement`, `canvas:remove-component`
- `agent:build:start`, `agent:build:plan`, `agent:build:partial`, `agent:build:pipeline-plan` (canvas building UX)
- `session:list-for-component` (sessions are per-conversation now, not per-component)

### 2.3 Deleted dependencies (`CSlate/package.json`)

- `@dnd-kit/core`
- `@dnd-kit/utilities`

### 2.4 Refactored, not deleted

- `src/main/agent/skills/component-fix.ts` — still needed ("make it blue", "add a tooltip") but now targets **the last rendered card in the conversation**, not a canvas component.
- `src/main/agent/tools/writeComponent.ts` — keeps its build role, but drops placement. A built component lands inline in the current message; there is no canvas position.
- Orchestrator — still exists (new components must be built and uploaded), but its streaming output emits `agent:card` events instead of canvas placements.
- Pipelines (data source infrastructure) — kept. Cards can declare `dataSources` in their manifest and receive live data via the sandbox bridge. The *wiring UI* is gone; pipeline resolution happens implicitly when a card requests data.

---

## 3. What We Build

### 3.1 The single surface

```
┌──────────────────────────────────────────────────────┐
│  ☰  GPT-5 Sonnet ▾            ⚙                      │  ← header
├───────────┬──────────────────────────────────────────┤
│           │                                          │
│  Sessions │     Assistant: Here's this week's BTC:  │
│  ───────  │     ┌──────────────────────────────┐    │
│  Today    │     │  [live interactive chart]    │    │
│  · BTC    │     └──────────────────────────────┘    │
│    this   │     Weekly high $68,204 · low $61,903   │
│    week   │                                          │
│  · Trip                                              │
│    ideas                                             │
│  Yesterday                                           │
│  · Code   │                                          │
│    review │                                          │
│           │                                          │
│           ├──────────────────────────────────────────┤
│           │  [ask anything…                       ↵] │
└───────────┴──────────────────────────────────────────┘
```

Three regions:

- **SessionList** (left, collapsible) — the user's conversation history, grouped by day.
- **Conversation** (center) — the current thread; messages stream, cards render inline.
- **DockedChatBar** (bottom of conversation) — always visible, always ready.

### 3.2 New top-level feature areas

| Area | Purpose |
|---|---|
| **Chat** | The conversation view — the entire app, essentially. |
| **Sessions** | Persist, list, resume, rename, delete, search conversations. |
| **Cards** | Inline-rendered React components inside messages, personalized via bridge. |
| **Memory** | Explicit user preferences + implicit domain memory, editable in a dedicated panel. |
| **Models** | Seamless provider / model switching from the header, per-conversation. |

---

## 4. Migration Principles

1. **Delete before build.** Phase 1 is destructive so nothing legacy survives into Phase 2+.
2. **Contracts in `@cslate/shared` first.** Every new cross-process payload (card, session, memory) is a Zod schema before any consumer uses it.
3. **One message model.** An `AgentMessage` owns everything about a turn — text, cards, tool traces, timestamp.
4. **Sessions are first-class from day one.** Do not bolt them on; design the conversation view around session resumption.
5. **Personalization is data, not branching.** The agent sees memory as context; cards see preferences via the sandbox bridge. No feature flags.
6. **Never regress beauty.** Any card rendered inline has a default `inline` look that feels like a native part of the message bubble — no iframes, no crashes, no layout shift.

---

## 5. Phased Task List

Phases execute in order. Tasks within a phase may parallelize unless noted.

---

### PHASE 1 — Delete the canvas (destructive, clean slate)

**Goal:** after this phase, `npm run typecheck` passes with zero references to canvas, dnd-kit, or canvas-era skills. The app no longer launches a usable UI — that's fine; Phase 2 rebuilds it.

#### T1.1 — Delete canvas source directories and files
- Remove everything in §2.1.
- Remove canvas-specific tests co-located in `__tests__/`.
- Remove canvas imports from `src/renderer/App.tsx`, `src/renderer/layout/AppLayout.tsx`, `src/renderer/main.tsx`.

#### T1.2 — Remove canvas IPC handlers
- **File:** `src/main/ipc/project.ts` — strip `canvas:*` handlers. Keep project open/save/list (they serve session persistence next phase).
- **File:** `src/main/ipc/sessions.ts` — strip `session:list-for-component`. Keep `session:create`, `session:save`, `session:load`.
- **File:** `src/preload/channels.ts` — remove channels listed in §2.2.

#### T1.3 — Retire canvas-era agent code paths
- Delete skills: `state-wirer.ts`, `pipeline-wirer.ts`
- Delete actions: `clear-canvas.ts`, `remove-component.ts`
- **File:** `src/main/agent/skills/index.ts` — remove deleted skill registrations
- **File:** `src/main/agent/actions/index.ts` — remove deleted action registrations
- **File:** `src/main/agent/router.ts` — drop `state-wirer`, `pipeline-wirer`, `remove-component`, `clear-canvas` from enums. Leave `component-search` and `component-fix`.

#### T1.4 — Strip canvas dependencies
- **File:** `CSlate/package.json` — remove `@dnd-kit/core`, `@dnd-kit/utilities`
- `npm install` — regenerate lockfile

#### T1.5 — Provisional empty shell
- **File:** `src/renderer/App.tsx` — render a placeholder `<div className="h-screen grid place-items-center text-muted">Chat portal rebuilding…</div>` so the dev loop boots without crashing while Phase 2 is in progress.

**Acceptance:** `npm run typecheck` green. `npm run dev` opens a window with the placeholder. `grep -r "canvas" src/` returns only passing mentions in docs or comments.

---

### PHASE 2 — Chat foundation

**Goal:** a functional chat view with session list, message stream, and docked input. No cards yet — plain text LLM responses only.

#### T2.1 — Shared contracts: message and session schemas
- **Repo:** `CSlate-shared`
- **New file:** `src/schemas/conversation.ts`
  ```ts
  export const MessageCardSchema = z.object({
    bundle: z.string(),
    manifest: z.unknown(),
    componentId: z.string().optional(),
    source: z.enum(['server', 'generated']),
    score: z.number().min(0).max(1).optional(),
  })

  export const AgentMessageSchema = z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    cards: z.array(MessageCardSchema).default([]),
    createdAt: z.number(),
  })

  export const SessionSchema = z.object({
    id: z.string(),
    title: z.string(),                   // auto-generated from first user message
    modelId: z.string(),                 // snapshot at session creation
    createdAt: z.number(),
    updatedAt: z.number(),
    messages: z.array(AgentMessageSchema),
  })

  export const SessionSummarySchema = SessionSchema.pick({
    id: true, title: true, modelId: true, createdAt: true, updatedAt: true
  }).extend({ messageCount: z.number() })
  ```
- Export from `src/index.ts`. Publish minor bump (`0.4.0`). Update `CSlate/package.json` to pick up the new version.
- **Acceptance:** `import { AgentMessageSchema } from '@cslate/shared'` works in the client.

#### T2.2 — New IPC channels
- **File:** `src/preload/channels.ts`
- Invoke: `session:list`, `session:get`, `session:create`, `session:append`, `session:rename`, `session:delete`, `session:search`
- Invoke: `memory:list`, `memory:read`, `memory:write`
- Listen: `agent:token`, `agent:card`, `agent:done`, `agent:error` (keep current token channel, add card)
- **Acceptance:** channels typed via `InvokeChannel` / `ListenChannel` unions.

#### T2.3 — Session persistence (main process)
- **New file:** `src/main/sessions/store.ts` — reads/writes sessions to `~/.cslate/sessions/{id}.json` using `safePath`.
- **New file:** `src/main/ipc/session.ts` — handlers for all session:* channels. `session:search` does a simple substring match over titles + message content; good enough for now.
- **File:** `src/main/index.ts` — register the new IPC module.
- **Acceptance:** vitest unit tests cover create → append → list → search → delete.

#### T2.4 — `chatStore` rebuilt around sessions
- **File:** `src/renderer/store/chatStore.ts` — full rewrite
  ```ts
  interface ChatState {
    activeSessionId: string | null
    messages: AgentMessage[]
    streaming: { messageId: string | null }
    status: 'idle' | 'generating' | 'error'
    loadSession(id: string): Promise<void>
    startNewSession(): void
    appendUserMessage(content: string): AgentMessage    // returns created msg
    appendAssistantDraft(): AgentMessage                // creates empty streaming msg
    appendTokenToStream(delta: string): void
    attachCardToStream(card: MessageCard): void
    completeStream(): Promise<void>                     // persists via session:append
  }
  ```
- Remove `panelOpen`, `activeComponentIds`, `publishPayload`, `messageQueue` — all canvas-era.
- **Acceptance:** unit test seeds a session, loads it, appends tokens, completes, verifies persistence.

#### T2.5 — SessionList component
- **New file:** `src/renderer/chat/SessionList.tsx`
- Left sidebar, 280px wide, collapsible via `⌘B`.
- Fetches via `session:list`, groups by day (Today / Yesterday / This week / Earlier).
- Click a session → `chatStore.loadSession(id)`. Highlight active.
- Context menu per row: rename, delete.
- Search input at top → `session:search`.
- **Acceptance:** seeded sessions appear in the list; clicking loads them into the conversation.

#### T2.6 — Rebuild `AppLayout`
- **File:** `src/renderer/layout/AppLayout.tsx` — delete the canvas-era layout; replace with:
  ```
  <div className="h-screen flex bg-background">
    <SessionList collapsed={…} />
    <main className="flex-1 flex flex-col">
      <Header />
      <MessageList />
      <DockedChatBar />
    </main>
  </div>
  ```
- `Header` (new component): app icon, model picker (dropdown from `models:fetch`), settings button.
- **Acceptance:** app boots into chat view with an empty message list and a focused input.

#### T2.7 — `DockedChatBar`
- **New file:** `src/renderer/chat/DockedChatBar.tsx`
- Textarea auto-grows to max 8 lines; `Enter` submits, `Shift+Enter` newline.
- Disabled (with spinner) while `status === 'generating'`.
- Submit triggers `useChat().submit(text)`.
- **Acceptance:** typing + Enter sends a message; UI disables during stream.

#### T2.8 — `useChat` hook, rewritten for session flow
- **File:** `src/renderer/chat/useChat.ts` — delete current implementation, rewrite:
  1. If no `activeSessionId`, `startNewSession()`.
  2. `appendUserMessage(text)`; `appendAssistantDraft()`.
  3. `ipc.invoke('agent:run', { sessionId, message, history, modelId })`.
  4. Listen `agent:token` → `appendTokenToStream`.
  5. Listen `agent:done` → `completeStream()`.
  6. Listen `agent:error` → set error state, surface a toast.
- **Acceptance:** a full roundtrip against a mocked agent handler passes in vitest.

#### T2.9 — `MessageList` (text-only, cards in Phase 3)
- **File:** `src/renderer/chat/MessageList.tsx` — rewrite to the new `AgentMessage` shape.
- No cards yet — just the role + markdown rendering + a space reserved below each assistant bubble where cards will land in Phase 3.
- **Acceptance:** text conversations stream smoothly, scroll pinned to bottom during streaming.

**Phase 2 acceptance:** a user can open the app, type, get a text answer, see the session appear in the list, restart the app, reopen the session, and continue.

---

### PHASE 3 — Inline card rendering

**Goal:** when the main process emits `agent:card`, a live React component renders inside the assistant message. No routing logic yet; we just prove the rendering pipe.

#### T3.1 — `DynamicComponent` reshaped for inline use only
- **File:** `src/renderer/sandbox/DynamicComponent.tsx`
- Remove the `canvas` variant — only inline exists now.
- Inline styling: full width of message bubble, auto height, rounded border, subtle shadow, internal scroll if content > 480px tall.
- Bridge gains a `theme` property reading from `useAppStore().preferences.theme` so cards can adapt.
- **Acceptance:** a trivial bundle renders in a test harness with the inline look.

#### T3.2 — `ChatMessage` component
- **New file:** `src/renderer/chat/ChatMessage.tsx`
- Renders one message: role bubble, markdown body, then `card`s stacked vertically in a `space-y-3` column below the text.
- Right-align user messages; left-align assistant.
- Copy + regenerate actions for assistant messages.
- **Acceptance:** visually clean for text-only, text+1 card, text+N cards, card-only.

#### T3.3 — `chatStore.attachCardToStream`
- Wire `agent:card` in `useChat` → append to the streaming assistant message's `cards` array immutably.
- **Acceptance:** emit a fake `agent:card` mid-stream; card appears below streaming text.

#### T3.4 — Sandbox bridge extended with personalization
- **File:** `src/renderer/sandbox/DynamicComponent.tsx`
- `bridge.user`: `{ theme: 'dark' | 'light', density: 'comfortable' | 'compact', preferences: Record<string, unknown> }` — sourced from `memory/user_preferences.md` (main process exposes via `memory:get-preferences` IPC, cached on renderer).
- Cards can read `bridge.user.preferences.colorPalette` etc.
- **Acceptance:** a card that consumes `bridge.user.theme` re-renders when the user flips the theme in settings.

**Phase 3 acceptance:** feeding a hand-crafted card payload via the main process shows a live inline card inside the conversation, styled to the user's theme.

---

### PHASE 4 — The render-decision loop

**Goal:** the agent automatically decides when a card would improve a response, searches the server library, fetches the bundle, or generates a new one. This is the core product magic.

#### T4.1 — Router: add `render` route
- **File:** `src/main/agent/router.ts`
- Replace existing route enum with: `['render', 'build', 'chat', 'action']`
  - `render` — the user asked an informational question that benefits from a visualization. Default for any "show me / how did / compare / track" question.
  - `build` — explicit build request ("make me a timer component").
  - `chat` — pure conversation (opinions, philosophy, troubleshooting steps, code snippets).
  - `action` — no-LLM direct operations (only `regenerate-last`, `fork-session` now).
- Rewrite `ROUTER_SYSTEM` prompt around the new taxonomy.
- **Acceptance:** classifier scoring suite (see T4.5) passes ≥ 90%.

#### T4.2 — `render-decision` skill
- **New folder:** `src/main/agent/skills/render-decision/`
  - `index.ts` — public `run()` entry generator
  - `classify-render-type.ts` — `runStructuredAgent` → `{ renderType: string | null, searchQuery: string, dataNeeds: string[] }`
  - `fetch-or-generate.ts` — server search, threshold check, bundle fetch, fallback to orchestrator
  - `prompt.ts` — system prompt fragments
- Constants:
  - `RENDER_SCORE_THRESHOLD = 0.82`
  - `SEARCH_LIMIT = 5`
- **Acceptance:** unit tests for all three branches (skip / fetch / generate) with mocked server client.

#### T4.3 — Orchestrator emits inline cards
- **File:** `src/main/agent/orchestrator/index.ts`
- Strip all `agent:build:*` events. When `writeComponent` tool completes, emit `agent:card` with the bundle + manifest. No placement, no canvas store.
- Remove `componentShipped` / `stagedComponentId` canvas-era bookkeeping; staging is still useful for crash recovery so keep it, but keyed by session/message, not component.
- **Acceptance:** orchestrator-built components show up inline in the triggering assistant message.

#### T4.4 — `CSlateServerClient` schema-aligned
- **File:** `src/main/server/CSlateServerClient.ts`
- Replace hand-rolled types with `z.infer<>` from `@cslate/shared` (`SearchRequestSchema`, `SearchResultSchema`, `ComponentPackageSchema`).
- Parse responses with `.safeParse()`; throw `ServerContractError` on mismatch.
- **Acceptance:** a malformed server response surfaces as a typed error, not an undefined access.

#### T4.5 — Classifier test suite
- **New file:** `src/main/agent/router/__tests__/classify-real-cases.test.ts`
- 20+ realistic prompts labeled with expected route. Run against the real classifier with a deterministic fast model. Fail if accuracy < 90%.
- Examples:
  - "show me bitcoin this week" → render
  - "what's the capital of Peru" → chat
  - "build me a pomodoro timer" → build
  - "regenerate that" → action
- **Acceptance:** suite passes.

**Phase 4 acceptance:** "show me tesla vs apple this month" produces an assistant message with explanatory text + a live inline chart card (fetched from the server library if it exists, generated + uploaded if not).

---

### PHASE 5 — Session polish

**Goal:** sessions feel first-class, not bolted on.

#### T5.1 — Auto-titling
- When a session's first user message is sent, schedule a fast-model `runStructuredAgent` call returning `{ title: string }` (max 6 words). Update the session record.
- **Acceptance:** new sessions get a sensible title within a second of sending the first message.

#### T5.2 — Fork session
- Right-click a message → "Fork from here" → new session seeded with messages up to that point.
- Action: `fork-session` via `actionRegistry` (no LLM call).
- **Acceptance:** forking produces a working parallel conversation.

#### T5.3 — Regenerate last response
- Header or message action → `regenerate-last`: drops the last assistant message, reruns with same inputs.
- **Acceptance:** repeated regenerate yields new responses each time.

#### T5.4 — Session search
- SessionList search input → `session:search` substring over title + content.
- Debounced, highlights match.
- **Acceptance:** typing "bitcoin" shows only BTC-related sessions.

#### T5.5 — Export session
- Right-click session → Export as Markdown or JSON.
- Markdown export inlines cards as linked bundle IDs + manifest summaries (cards are live; can't embed in markdown).
- **Acceptance:** exported file opens cleanly in any markdown viewer.

---

### PHASE 6 — Personalization

**Goal:** the app learns the user and adapts the experience.

#### T6.1 — Memory panel UI
- **New file:** `src/renderer/settings/MemoryPanel.tsx`
- Three editable text areas: `user_preferences.md`, `domain_context.md`, and a read-only `componentHistory` log.
- Save button → `memory:write`.
- **Acceptance:** edits persist across restarts.

#### T6.2 — Memory-driven agent prompts
- **File:** `src/main/agent/memory/context-builder.ts` — already exists; confirm it injects preferences into the system prompt for every skill + the orchestrator.
- **Acceptance:** setting a preference ("I like dense, data-first layouts") measurably changes generated card style in a golden test.

#### T6.3 — Theme + density preferences apply to the chat UI
- `useAppStore().preferences` drives CSS variables (spacing, font size, accent hue).
- Settings panel surfaces these as sliders/toggles.
- **Acceptance:** flipping density instantly reflows the conversation view.

#### T6.4 — Per-session model memory
- A session remembers which model it started on. Switching models mid-conversation prompts the user: "Continue with GPT-5 Sonnet, or fork to a new session?"
- **Acceptance:** the prompt appears on model change; forking creates a sibling session.

---

### PHASE 7 — Quality and alignment

#### T7.1 — Align Vitest v2 across all three repos
- Bump `CSlate` and `CSlate-shared` to Vitest `^2.x`. Fix any broken matchers.

#### T7.2 — Upgrade `react-markdown` to v9
- New `code` renderer signature. Enable GFM (tables, task lists, strikethrough).

#### T7.3 — `@cslate/shared`: pin `@ai-sdk/provider`
- Add to devDependencies at the resolved version. Add a unit test that `buildRegistry({ provider: 'local', … })` instantiates without throwing.

#### T7.4 — Documentation refresh
- `docs/client-spec.md` — rewrite to reflect chat-only reality.
- `docs/spec.md` — remove any lingering canvas references.
- `CLAUDE.md` — trim the architecture diagram and gotchas to post-pivot truth.

---

## 6. Sequencing

```
PHASE 1 (destructive) ─► PHASE 2 (chat foundation)
                                 │
                                 ▼
                         PHASE 3 (inline cards)
                                 │
                                 ▼
                         PHASE 4 (render loop)
                                 │
                        ┌────────┴────────┐
                        ▼                 ▼
                  PHASE 5 (sessions)  PHASE 6 (personalization)
                        └────────┬────────┘
                                 ▼
                         PHASE 7 (polish)
```

Phases 5 and 6 parallelize once Phase 4 lands.

---

## 7. Overall Acceptance

The migration is complete when all of these are true in a fresh install:

1. Opening the app shows a chat view with a session list on the left and an empty conversation ready to receive input.
2. Typing "show me tesla stock this week" produces streaming explanatory text and a live inline chart card, personalized to the user's theme and density preferences.
3. Typing "what's the capital of Peru" produces a clean text-only answer with no card, no placeholders, no loading spinners left behind.
4. Closing and reopening the app restores the previous session exactly, card bundles and all.
5. The session list shows a sensibly-titled entry grouped by day.
6. `grep -r "canvas\|panelOpen\|chatVisible" src/` returns zero hits in source (docs/history allowed).
7. `npm run typecheck` + `npm test` green; same for `CSlate-server` and `CSlate-shared`.
8. `docs/client-spec.md` accurately describes the running app with no canvas references.

---

## 8. Out of Scope

Resist these until post-migration:

- Voice input / output
- Multi-pane conversations (side by side)
- Card marketplace browse UI on the client
- MCP tool integration
- Mobile / web builds
- Collaborative sessions (shared live conversations)
