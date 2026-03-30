# CSlate Desktop Client — Design Specification

**Date:** 2026-03-28
**Version:** 1.1 (Post Critical Review)
**Status:** Active — Plans 01/02/05 complete, Plan 03 (server integration) in progress
**Scope:** MVP (v1)

---

## 1. Product Overview

### 1.1 What CSlate Is

CSlate is an AI-powered desktop app building platform. Non-technical users describe components in natural language, an AI agent generates live React components, renders them on a canvas ("Slate"), and iterates based on user feedback. Users are nudged to share accepted components to a community library (opt-in, never default-on — see Decision 015), creating a self-improving ecosystem where every user's work benefits future users.

### 1.2 Core Loop

```
Describe → Search community blueprints → Generate/modify → Render → Iterate → Share
```

### 1.3 Target Users

Non-technical people who want to build applications through conversation with AI. They never see code, state management, or API configurations — the AI handles all of that.

### 1.4 Success Criteria (v1)

1. User can open CSlate, press `Cmd+K`, describe a component, and see it rendered on the Slate
2. User can iterate on the component via conversation until satisfied
3. User can place multiple components on a tab and they communicate via shared state
4. User can search the community DB for blueprints and use them as starting points
5. User can upload finished components to the community DB (opt-in with strong nudge)
6. Components are checkpointed locally and backed up to the cloud
7. User can roll back any component to a previous version
8. The experience works with at least 2 LLM providers (OpenAI + Anthropic)
9. Components can connect to external APIs through the permission-gated data bridge

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│ ELECTRON MAIN PROCESS (Node.js, trusted)                │
│ - Window management, file system, IPC hub               │
│ - safeStorage for API keys + sensitive credentials      │
│ - Auto-updater                                          │
│ - Data bridge proxy (HTTP requests for sandbox)         │
└────────────────────┬────────────────────────────────────┘
                     │ IPC (contextBridge)
┌────────────────────▼────────────────────────────────────┐
│ HOST RENDERER (React, trusted)                          │
│ ┌──────────┐ ┌──────────┐ ┌───────────────────────────┐│
│ │ Tab Bar   │ │ AI Chat  │ │ Slate Canvas              ││
│ │ Browser-  │ │ Cmd+K →  │ │ - 8px snap grid           ││
│ │ style     │ │ side     │ │ - Component placeholders   ││
│ │ tabs      │ │ panel    │ │ - Permission prompts       ││
│ └──────────┘ └──────────┘ │ - State manager (Zustand)  ││
│                           │ - Event bus                 ││
│                           └─────────┬─────────────────┘│
│                                     │ postMessage       │
│ ┌───────────────────────────────────▼─────────────────┐│
│ │ SANDBOX IFRAME (null origin, allow-scripts)          ││
│ │ - React render tree for all components               ││
│ │ - bridge.fetch() / bridge.subscribe() for data       ││
│ │ - No direct network access, no Node.js, no FS       ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
         │                              │
    Local FS                    HTTPS to Server
         │                              │
  ┌──────▼──────┐              ┌────────▼────────┐
  │ Project Dir  │              │ CSlate Server   │
  │ components/  │              │ Hono + Drizzle  │
  │ tabs/        │              │ pgvector on Neon│
  │ theme.json   │              │ R2 storage      │
  └─────────────┘              └─────────────────┘
```

### 2.2 Three Repositories

| Repo | Purpose | Tech |
|---|---|---|
| `CSlate` | Electron desktop client | Electron + React + TypeScript |
| `CSlate-server` | Backend API, review pipeline, component DB | Hono + Drizzle + pgvector + Fly.io |
| `CSlate-shared` | Zod schemas, shared types | TypeScript + Zod |

### 2.3 Technology Stack (Client)

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Electron | Consistent Chromium rendering across platforms, Node.js backend, turnkey sandboxing |
| Frontend | React + TypeScript | Industry standard, vast ecosystem, AI generates reliably |
| Bundler | Vite | Sub-second HMR, fast builds |
| State | Zustand | Simple key-value, external API, no providers, AI-friendly |
| Styling | Tailwind CSS + design tokens | AI generates reliably, semantic tokens for theme consistency |
| Sandbox | iframe (sandbox="allow-scripts") | Process-level isolation, null origin |
| Local storage | Filesystem (JSON + TSX files) | User owns data, works offline |
| Secure storage | Electron safeStorage | OS-level encryption for API keys |

---

## 3. Component Model

### 3.1 Multi-File Package Structure

Every component is a structured package:

```
stock-ticker/
├── ui.tsx           # Required: visual React component (sandbox entry point)
├── logic.ts         # Optional: business logic, hooks, data transforms
├── types.ts         # Optional: TypeScript interfaces
├── context.md       # Required: AI-generated summary of build conversation
└── manifest.json    # Required: contract (inputs, outputs, events, actions, data)
```

**File roles:**
- `ui.tsx` — What renders. Imports from `logic.ts` and `types.ts`. Uses Tailwind + design tokens.
- `logic.ts` — Business logic separated from visuals. Custom hooks, data transforms, utilities.
- `types.ts` — Shared TypeScript interfaces for the component's data shapes.
- `context.md` — AI-generated clean summary of the build conversation and design decisions. Never contains raw chat. Preserved through community sharing. Indexed for search.
- `manifest.json` — The contract that enables AI wiring, community search, and platform validation.

### 3.2 Component Manifest (Full Specification)

```typescript
interface ComponentManifest {
  // === IDENTITY ===
  id?: string;                    // UUID, assigned by server on upload
  name: string;                   // "Stock Ticker"
  description: string;            // Natural language, used for embedding + search
  tags: string[];                 // ["finance", "real-time", "dashboard"]
  version?: string;               // Semver, server manages

  // === DATA INTERFACE ===
  inputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;
      required: boolean;
      default?: any;
      stateKey?: string;          // Zustand store key to bind to
    };
  };

  outputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;
      stateKey?: string;
    };
  };

  events: {
    [eventName: string]: {
      description: string;
      payload: Record<string, { type: string; description: string }>;
    };
  };

  actions: {
    [actionName: string]: {
      description: string;
      params: Record<string, { type: string; description: string }>;
    };
  };

  // === PACKAGE STRUCTURE ===
  files: {
    path: string;
    type: 'ui' | 'logic' | 'types' | 'context' | 'style' | 'test' | 'other';
    role: string;
  }[];

  // === COMPOUND ANATOMY ===
  anatomy?: {
    parts: string[];              // ["header", "body", "footer"]
    slots?: string[];             // ["header-right", "body-content"]
  };

  // === DEPENDENCIES ===
  dependencies?: {
    cslateComponents?: string[];
    npmPackages?: { name: string; version: string }[];
  };

  // === EXTERNAL DATA SOURCES (optional — omit if no external data needed) ===
  dataSources?: {
    [sourceId: string]: {
      description: string;
      type: 'rest-api' | 'websocket' | 'graphql';
      baseUrl: string;
      endpoints: {
        [endpointId: string]: {
          path: string;
          method: 'GET' | 'POST';
          description: string;
          params: {
            [paramName: string]: {
              type: string;
              description: string;
              userConfigurable: boolean;
              default?: any;
            };
          };
          refreshInterval?: number;
        };
      };
      rateLimit?: { maxRequests: number; perSeconds: number };
    };
  };

  // === USER-CONFIGURABLE PARAMETERS (optional — omit if no user config needed) ===
  userConfig?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'string[]' | 'object';
      description: string;
      required: boolean;
      default?: any;
      sensitive?: boolean;        // API keys, tokens — never shared
      example?: any;
    };
  };

  // === AI HINTS (server-generated during review) ===
  ai?: {
    modificationHints?: string[];
    extensionPoints?: string[];
    similarTo?: string[];
  };

  // === LAYOUT ===
  defaultSize: { width: number; height: number };  // grid units (multiply by 8 for pixels)
  minSize?: { width: number; height: number };      // grid units (multiply by 8 for pixels)
}
```

### 3.3 Component Communication

#### Zustand Store (Shared Reactive State)

One Zustand store per Slate tab. Components read/write named keys:

- `inputs` with `stateKey` bind a component's prop to a store key (reads)
- `outputs` with `stateKey` declare which store keys a component writes to
- AI wires components by matching output keys → input keys across manifests
- External orchestration via `getState()` / `setState()` / `subscribe()`
- State keys are instance-prefixed: `instanceId.keyName` (e.g., `comp_abc123.todoList`). Prevents collisions when multiple instances of the same component type share a canvas.

Optional app-level store for cross-tab state (user preferences, auth).

#### Typed Event Bus (Notifications)

Lightweight typed EventEmitter for fire-and-forget patterns:

- Components declare `events` (what they emit) and `actions` (what they respond to)
- Used for: notifications, imperative actions ("refresh", "scroll to"), integration points
- AI wires event listeners based on manifest matching

#### Why Both

- State alone can't handle fire-and-forget notifications ("show toast", "trigger animation")
- Events alone can't answer "what is the current value?" (late-mounting components miss events)
- Every successful low-code platform uses this hybrid (Power Apps, Appsmith, ToolJet, Retool)

---

## 4. Data Bridge & Permissions

### 4.1 The Problem

Components need live data to be useful (stock prices, weather, APIs). But they run in a sandboxed iframe with zero network access. The Data Bridge solves this.

### 4.2 Architecture

Components declare `dataSources` in their manifest. The host renderer acts as a permission-gated proxy:

1. Component calls `bridge.fetch(sourceId, endpointId, params)`
2. Message sent to host via postMessage
3. Host validates: source declared in manifest? User approved? Rate limit OK?
4. Host makes actual HTTP request
5. Host returns sanitized response to sandbox

### 4.3 Permission Flow

Components may declare up to **5 dataSources** in their manifest. When a component with `dataSources` is placed on the Slate, permissions are evaluated using a tiered model:

| Tier | Criteria | UX |
|---|---|---|
| **Tier 1** | Public APIs (no auth, well-known domains, read-only) | Auto-approved, silent |
| **Tier 2** | APIs requiring user config (symbols, API keys, etc.) | Inline config panel shown inline on placement |
| **Tier 3** | Unknown/sensitive origins or write operations | Blocking modal — user must explicitly approve |

1. Host evaluates each data source against the tier criteria
2. Tier 1 sources activate silently; Tier 2 show inline config; Tier 3 show a blocking modal
3. If `userConfig` fields exist, user fills them in (e.g., stock symbols)
4. Approved permissions stored per-component in `.cslate/permissions.json`
5. Sensitive values (`sensitive: true`) stored in Electron safeStorage
6. User can revoke anytime: right-click component → Permissions

### 4.4 Bridge API (Sandbox-Side)

```typescript
const bridge = {
  fetch: async (sourceId: string, endpointId: string, params?: Record<string, any>) => Response,
  subscribe: (sourceId: string, endpointId: string, params: Record<string, any>, callback: (data: any) => void) => UnsubscribeFn,
  getConfig: (key: string) => any,
};
```

### 4.5 Community Upload: Data Stripping

- `userConfig` values are stripped (schemas preserved)
- `dataSources` declarations preserved as-is
- Sensitive values never leave the client
- Component becomes a configurable template for the next user

---

## 5. Sandboxing (v1)

### 5.1 Single Sandbox iframe

All user-generated components render inside one iframe:
- `sandbox="allow-scripts"` — scripts run, everything else blocked
- Null origin — no access to host cookies, storage, DOM
- No Node.js, no Electron APIs, no `fetch`, no `localStorage`

### 5.2 Communication Protocol

```
Host → Sandbox:
  COMPONENT_LOAD    { id, files, props }
  COMPONENT_REMOVE  { id }
  STATE_UPDATE      { id, props }

Sandbox → Host:
  EVENT             { id, type, data }
  BRIDGE_REQUEST    { id, sourceId, endpointId, params }

All via MessageChannel (not broadcast postMessage).
```

### 5.3 Security Layers (v1)

1. **Server-side review** — 7-stage pipeline catches malicious code before it enters community DB
2. **Opt-in sharing with nudge** — components are reviewed before reaching other clients
3. **iframe sandbox boundary** — hard process-level isolation from host
4. **Data bridge proxy** — no direct network access, host validates every request
5. **Permission system** — user explicitly approves each data source

**v1 hardened iframe approach:** frozen prototypes to prevent prototype pollution, Shadow DOM per component for DOM scoping, per-component MessagePorts (not broadcast postMessage), scoped bridge object injected per component, and CSP header on the sandbox document.

### 5.4 v2 Enhancements (Deferred)

- SES `lockdown()` + Compartments (per-component JS isolation) — **deferred to v2**
- near-membrane proxy (per-component DOM scoping) — **deferred to v2**
- Per-component API allowlisting

---

## 6. User Experience

### 6.1 The Slate Canvas

- Clean white/dark background (follows theme tokens)
- 8px base unit snap-to-grid with alignment guides
- Smart snapping to neighboring component edges/centers
- Hold `Alt`/`Option` to disable snapping temporarily
- Components placed, resized, and arranged via drag handles

### 6.2 Grid System

```typescript
interface GridConfig {
  baseUnit: 8;                  // px — all dimensions snap to multiples
  showGrid: boolean;
  snapEnabled: boolean;
  gutterSize: number;           // Default: 8px (1 unit)
  padding: number;              // Default: 16px (2 units)
}

interface ComponentPlacement {
  x: number;                    // Position in grid units (x * 8px)
  y: number;
  width: number;                // Size in grid units
  height: number;
}
```

### 6.3 Tab System

Browser-style tab bar at top of window:
- "+" button to add new Slate tab
- Each tab: independent Slate, state store, chat history
- Drag to reorder, double-click to rename, right-click for context menu
- Close button (×) on each tab

### 6.4 AI Chat Interface

**Two modes with seamless transition:**

#### Command Bar (Default — `Cmd+K` / `Ctrl+K`)
- Centered floating input field (Spotlight/Raycast style)
- Semi-transparent backdrop
- For quick one-shot requests: "add a todo list"
- Processes → renders → auto-dismisses with confirmation toast

#### Chat Panel (Expanded)
- Slides in from right side (max 30-40% of width)
- Full conversation history, inline component previews
- Action buttons: Accept, Undo, Try Again
- Triggered by: AI clarifying questions, user feedback, iteration start

**Transition:** Command bar → chat panel when multi-turn detected. `Escape` or collapse to return.

**Keyboard shortcuts:**
- `Cmd+K` / `Ctrl+K` — Open command bar
- `Escape` — Dismiss / collapse
- `Cmd+Enter` / `Ctrl+Enter` — Accept current component iteration

### 6.5 Component Iteration Loop

1. User describes via command bar → AI searches community DB for blueprints
2. AI generates/modifies component → renders on Slate
3. Single-turn → done (toast). Multi-turn → chat panel opens
4. User gives feedback → AI modifies → re-renders. Loop until "Accept"
5. Checkpoint saved locally + async cloud backup
6. Non-blocking toast: "Share with the CSlate community?" [Share] / [Not now] — opt-in, never automatic

### 6.6 Version Rollback

- Right-click component → "Version History"
- List of checkpoints with timestamps and AI descriptions
- Preview any version before restoring
- Restore = auto-checkpoint current version first (reversible)
- AI can also rollback via chat: "undo last 3 changes to the login form"

---

## 7. AI Agent System

> **v0.1:** Single LLM call with system prompt + 3-5 tools. The full skills/memory/workflows orchestrator system is the target architecture, built incrementally after v0.1 proves the core loop.

### 7.1 Core Identity

The CSlate Agent is an expert at building React component packages for the platform. It understands manifests, the sandbox, Zustand/event bus patterns, Tailwind tokens, the grid system, and the data bridge. Users can customize it but never override the core.

### 7.2 User-Configurable LLM

```typescript
interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'local' | 'custom';
  apiKey?: string;               // Stored in Electron safeStorage
  model: string;
  baseUrl?: string;              // For custom/local providers
  maxTokens?: number;
  temperature?: number;
  overrides?: {                  // Different models per task
    codeGeneration?: { model: string };
    search?: { model: string };
    feedback?: { model: string };
  };
}
```

### 7.3 Skills (v1)

| Skill | Purpose |
|---|---|
| `component-builder` | Generate/modify React component packages from natural language |
| `component-search` | Query server DB for similar blueprints |
| `manifest-generator` | Create/validate component manifests |
| `layout-arranger` | Determine grid placement for new components |
| `feedback-iterator` | Refine components based on user feedback |
| `state-wirer` | Connect components via Zustand store keys + event bus |
| `style-applier` | Apply consistent Tailwind + design token styling |

### 7.4 Memory

Persistent per-project memory:
```
project/agent/memory/
├── MEMORY.md              # Index
├── user_preferences.md    # Design taste, color schemes
├── project_context.md     # What the app is about
├── component_history.md   # What was built, iterations, outcomes
└── feedback_patterns.md   # Common refinement requests
```

### 7.5 Workflows

#### `new-component` (Primary)
```
Parse intent → Search blueprints → Select strategy → Generate code →
Validate locally → Render in sandbox → Collect feedback → Iterate or finalize →
Checkpoint + upload
```

#### `modify-component`
```
Identify target → Parse modification → Load source → Generate modified code →
Re-render → Collect feedback → Iterate or finalize
```

#### `connect-components`
```
Analyze all manifests → Identify input↔output matches → Propose wiring →
Apply state/event connections → Test interaction flow
```

---

## 8. Styling System

### 8.1 Tailwind + Design Tokens

Components use Tailwind utility classes with semantic token references:

```jsx
// CORRECT — uses semantic tokens
<button className="bg-primary text-white rounded-md px-4 py-2 shadow-sm">

// WRONG — hardcoded colors
<button className="bg-blue-500 text-white rounded-md px-4 py-2 shadow-md">
```

### 8.2 Token System

```typescript
interface SlateTheme {
  colors: {
    primary: string;            // --slate-primary
    secondary: string;          // --slate-secondary
    accent: string;             // --slate-accent
    background: string;         // --slate-bg
    surface: string;            // --slate-surface
    text: string;               // --slate-text
    textMuted: string;          // --slate-text-muted
    border: string;             // --slate-border
    error: string;              // --slate-error
    success: string;            // --slate-success
    warning: string;            // --slate-warning
  };
  spacing: { unit: number };
  typography: {
    fontFamily: string;
    fontFamilyMono: string;
    scale: number;
  };
  radius: { sm: string; md: string; lg: string; full: string };
  shadows: { sm: string; md: string; lg: string };
}
```

### 8.3 How Theming Works

1. Tailwind config maps token names to CSS variable references: `primary: 'var(--slate-primary)'`
2. Host injects theme CSS variables into sandbox iframe's `:root`
3. User changes theme → all components update instantly (CSS cascade)
4. Presets: Light, Dark, Midnight, etc. User can customize individual tokens via AI.

---

## 9. Data Persistence

### 9.1 Local Project Structure

```
my-app/
├── cslate.json              # App manifest (name, version, settings)
├── tabs/
│   ├── home.json            # Tab config (grid layout, component placement)
│   └── dashboard.json
├── components/
│   ├── stock-ticker/
│   │   ├── ui.tsx
│   │   ├── logic.ts
│   │   ├── types.ts
│   │   ├── context.md
│   │   ├── manifest.json
│   │   └── versions/
│   │       ├── v1/              # Full package snapshot
│   │       │   ├── ui.tsx, logic.ts, types.ts, manifest.json
│   │       │   └── v1.meta.json # Timestamp, description, trigger
│   │       └── v2/
│   │           └── ...
│   └── todo-list/
│       └── ...
├── theme.json
├── agent/
│   ├── memory/
│   └── config.json
└── .cslate/
    ├── permissions.json     # Data bridge permissions per component
    └── sync.json            # Cloud sync state
```

### 9.2 Checkpointing

**Triggers:** User accept, before major change, manual, auto-interval.

**Checkpoint data:** Full package files + manifest + AI description.

**Local:** Last 20 checkpoints per component. Older available from cloud.

**Cloud backup:** Async, non-blocking. Queue + sync on reconnect if offline.

### 9.3 Community Sharing (Opt-In with Strong Nudge)

When a component is accepted, a non-blocking toast appears: "Share with the CSlate community?" with **[Share]** / **[Not now]** options. Sharing is never automatic — the user always makes an explicit choice.

If the user shares, the component enters the server review pipeline. If they decline, it remains private.

Users can change their mind later:
- Per-component: right-click → "Share with Community" or "Keep Private"
- Per-project: project settings
- Global: app settings

Private components still get cloud checkpoint backups.

---

## 10. Client-Server Integration

### 10.1 Authentication

API key stored in Electron safeStorage:
```
Authorization: ApiKey <api_key>
```

### 10.2 Endpoints Used by Client

| Action | Endpoint | Notes |
|---|---|---|
| Register | `POST /api/auth/register` | Returns API key |
| Search blueprints | `GET /api/components/search` | Natural language query |
| Fetch blueprint source | `GET /api/components/:id/source?includeDeps=true` | Full package + direct deps |
| Upload component | `POST /api/components/upload` | 202 → async review |
| Monitor review | `GET /api/components/upload/:id/stream` | SSE, 7 stages |
| Check updates | `POST /api/components/check-updates` | On launch + every 30min |
| Upload checkpoint | `POST /api/checkpoints` | Async backup |
| Fetch checkpoint history | `GET /api/checkpoints/:id` | Version list |
| Fetch checkpoint | `GET /api/checkpoints/:id/:version` | Full package |
| Report abuse | `POST /api/components/:id/report` | reason + description |
| Rate component | `POST /api/components/:id/rate` | 1-5 + comment |
| Browse trending | `GET /api/components/trending` | Discovery |

### 10.3 Shared Validation

Both client and server validate against Zod schemas from `@cslate/shared`. Manifest validation happens:
- Client-side: before upload (fast feedback)
- Server-side: Stage 1 of review pipeline (authoritative)

---

## 11. MVP Scope

### v0.1: Inner MVP

macOS only, single LLM provider (Anthropic), no community features, no tabs, no cloud sync, simple agent (single prompt call). Goal: validate describe → generate → render → iterate loop.

### 11.1 In v1

- Electron app with Slate canvas (8px grid)
- Browser-style tabs
- Floating AI chat (command bar → panel)
- Multi-file component generation from natural language
- Component rendering in sandbox iframe
- Zustand state store + event bus for component communication
- Component manifest with full spec (inputs, outputs, events, actions, dataSources, userConfig)
- Data bridge with permission-gated proxy for external APIs
- Tailwind + design tokens for styling with dark/light theme
- Local filesystem persistence with checkpoints
- Version rollback UI
- Server integration: search, upload (SSE), checkpoint backup, abuse reporting
- API key auth
- Community sharing opt-in with non-blocking toast nudge
- Agent with skills, memory, workflows
- Support for OpenAI + Anthropic LLM providers

### 11.2 Deferred to v2

- SES Compartments + near-membrane (enhanced sandboxing)
- MCP server integrations as data source plugins
- Custom user-defined skills and workflows
- Sub-agent spawning
- OAuth flow support for data sources
- Component rating UI
- Version update notifications
- Sidebar navigation (Notion-style)
- Voice input
- Responsive breakpoints
- Component dependency tree resolution
- Export/deploy apps
- Author profiles and reputation

---

## 12. Decision Log

All decisions documented in `docs/decisions/`:

| # | Decision | Status |
|---|---|---|
| 001 | Project vision & core concepts | Accepted |
| 002 | Structured layout with dense dynamic grid | Accepted |
| 003 | Electron as desktop runtime | Accepted |
| 004 | Client/server architecture split (two repos) | Accepted |
| 005 | Component communication (Zustand + event bus + manifest) | Accepted |
| 006 | Component sandboxing (single iframe + SES deferred) | Accepted |
| 007 | AI agent architecture (orchestrator + skills/memory/workflows) | Accepted |
| 008 | Component styling (Tailwind + design tokens) | Accepted |
| 009 | AI chat interface (command bar → expandable panel) | Accepted |
| 010 | App tabs/navigation (browser-style tabs, v1) | Accepted |
| 011 | Data persistence (local FS + cloud checkpoints + rollback) | Accepted |
| 012 | Server contract alignment (multi-file, API key, extended manifest) | Accepted |
| 013 | Grid system (8px base unit, snap-to-grid) | Accepted |
| 014 | MVP scope (v1 vs v2) | Accepted |
| 015 | Community sharing opt-in with nudge (revised from default-on) | Accepted |
| 016 | Data bridge & permission system | Accepted |

---

## 13. Related Documents

- `docs/contracts/server-api-contract.md` — Full API contract (v2.0)
- `docs/contracts/server-team-full-context.md` — Everything the server team needs
- `docs/contracts/server-answers-to-client-followup.md` — Server answers round 1
- `docs/contracts/server-answers-round3-local.md` — Server answers round 3
- `docs/decisions/001-016` — Individual decision records
