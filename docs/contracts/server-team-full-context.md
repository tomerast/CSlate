# CSlate Server Team — Full Client Context & Design Decisions

**Date:** 2026-03-28
**Version:** 1.0
**Purpose:** Everything the CSlate-Server team needs to know about the client's architecture, design decisions, and what it expects from the server.

---

## Table of Contents

1. [What CSlate Is](#1-what-cslate-is)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Model](#3-component-model)
4. [Component Manifest (Full Spec)](#4-component-manifest-full-spec)
5. [Data Bridge & Permissions](#5-data-bridge--permissions)
6. [Community Sharing (Default-On)](#6-community-sharing-default-on)
7. [Component Lifecycle](#7-component-lifecycle)
8. [Checkpointing & Versioning](#8-checkpointing--versioning)
9. [Search Requirements](#9-search-requirements)
10. [Review Pipeline Requirements](#10-review-pipeline-requirements)
11. [API Contract Summary](#11-api-contract-summary)
12. [Shared Package (@cslate/shared)](#12-shared-package-cslateshared)
13. [Server Tech Decisions (Confirmed)](#13-server-tech-decisions-confirmed)
14. [Open Items & Future Coordination](#14-open-items--future-coordination)

---

## 1. What CSlate Is

CSlate is an AI-powered desktop app building platform. Non-technical users describe what they want in natural language, an AI agent generates live React components, renders them on a canvas, and iterates based on user feedback.

**Core loop:** Describe → Search community blueprints → Generate/modify → Render → Iterate → Share

**The community flywheel:** Every accepted component is shared to the community by default. The server reviews it, catalogs it, embeds it, and makes it searchable. Future users pull these components as blueprints, customize them, and contribute their improvements back. The library gets better with every user.

**Target users:** Non-technical people who want to build applications through conversation with AI. They never see code, state management, or API configs — the AI handles all of that.

**Platform:** Electron desktop app (macOS, Windows, Linux). TypeScript + React frontend. Chromium rendering engine ensures components look identical on all platforms.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ ELECTRON MAIN PROCESS (Node.js, trusted)                │
│ - Window management, file system, IPC hub               │
│ - safeStorage for API keys + sensitive credentials      │
│ - Auto-updater                                          │
│ - Data bridge proxy (makes HTTP requests for sandbox)   │
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

**Three repos:**
- `CSlate` — Electron desktop client
- `CSlate-server` — Backend API, review pipeline, component DB
- `CSlate-shared` — Zod schemas, shared TypeScript types (created once contract finalized)

---

## 3. Component Model

### Multi-File Packages

Every component is a structured package, not a single source file:

```
stock-ticker/
├── ui.tsx           # Visual React component (sandbox entry point)
├── logic.ts         # Business logic, hooks, data transforms
├── types.ts         # TypeScript interfaces
├── context.md       # AI conversation history / design decisions
└── manifest.json    # Contract: inputs, outputs, events, actions, data sources
```

**Why this matters for the server:**
- Upload payload is `{ manifest, files: Record<string, string> }` — a path→content map
- The review pipeline should validate different files differently:
  - `ui.tsx` — visual quality, Tailwind token usage, React best practices
  - `logic.ts` — business logic quality, security (no malicious code)
  - `types.ts` — type correctness
  - `context.md` — preserved as-is, indexed for search (never a rejection reason)
  - `manifest.json` — schema validation, completeness, accuracy
- The `ai.modificationHints` generated during review should reference specific files ("Change colors in ui.tsx", "Extend data transform in logic.ts")

### Component Communication

Components communicate through two mechanisms. The server doesn't manage these directly, but needs to understand them for manifest validation:

**Zustand Store (shared reactive state):**
- Tab-scoped key-value store
- Components declare `inputs` (keys they read) and `outputs` (keys they write) in their manifest
- The AI wires components by matching output keys to input keys

**Typed Event Bus (notifications):**
- Components declare `events` (what they emit) and `actions` (what they respond to) in their manifest
- Fire-and-forget: "item clicked", "form submitted", "refresh requested"

**Server relevance:** When cataloging, the server should index a component's inputs/outputs/events/actions for searchability. A user searching for "a component that shows user details" should find components with an input like `{ userId: { type: 'string', description: 'User to display' } }`.

### Styling

All components use **Tailwind CSS + CSlate design tokens**:
- Semantic token classes: `bg-primary`, `text-muted`, `rounded-md`, `shadow-sm`
- NOT hardcoded colors: never `bg-blue-500`, always `bg-primary`
- Tokens are CSS custom properties injected by the host (`--slate-primary`, `--slate-bg`, etc.)

**Server relevance:** The quality review stage should flag components using hardcoded Tailwind colors instead of semantic tokens. This ensures community components work across different user themes.

---

## 4. Component Manifest (Full Spec)

This is the single most important shared data structure. Both client and server MUST validate against the same Zod schema from `@cslate/shared`.

```typescript
interface ComponentManifest {
  // === IDENTITY ===
  id?: string;                    // UUID, assigned by server on upload
  name: string;                   // Human-readable: "Stock Ticker"
  description: string;            // Natural language, used for embedding + search
  tags: string[];                 // Categorization: ["finance", "real-time", "dashboard"]
  version?: string;               // Semver, server manages versioning

  // === INPUTS (what data this component reads) ===
  inputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;        // Natural language: "User ID to display profile for"
      required: boolean;
      default?: any;
      stateKey?: string;          // Zustand store key to bind to
    };
  };

  // === OUTPUTS (what state this component writes) ===
  outputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;        // "Currently selected item from the list"
      stateKey?: string;          // Zustand store key to write to
    };
  };

  // === EVENTS (notifications this component emits) ===
  events: {
    [eventName: string]: {
      description: string;        // "Fired when user clicks a list item"
      payload: Record<string, { type: string; description: string }>;
    };
  };

  // === ACTIONS (things this component can be told to do) ===
  actions: {
    [actionName: string]: {
      description: string;        // "Refresh the data display"
      params: Record<string, { type: string; description: string }>;
    };
  };

  // === PACKAGE STRUCTURE ===
  files: {
    path: string;                 // "ui.tsx", "logic.ts", etc.
    type: 'ui' | 'logic' | 'types' | 'context' | 'style' | 'test' | 'other';
    role: string;                 // "Main visual component", "Business logic hooks"
  }[];

  // === COMPOUND COMPONENT ANATOMY ===
  anatomy?: {
    parts: string[];              // Named sub-parts: ["header", "body", "footer"]
    slots?: string[];             // Insertion points: ["header-right", "body-content"]
  };

  // === DEPENDENCIES ===
  dependencies?: {
    cslateComponents?: string[];  // Other CSlate component IDs this depends on
    npmPackages?: {
      name: string;
      version: string;            // Semver range
    }[];
  };

  // === EXTERNAL DATA SOURCES ===
  dataSources: {
    [sourceId: string]: {
      description: string;        // "Live stock prices from Yahoo Finance"
      type: 'rest-api' | 'websocket' | 'graphql';
      baseUrl: string;            // "https://query1.finance.yahoo.com/v8/finance"
      endpoints: {
        [endpointId: string]: {
          path: string;           // "/quote"
          method: 'GET' | 'POST';
          description: string;    // "Fetch current price for given symbols"
          params: {
            [paramName: string]: {
              type: string;
              description: string;
              userConfigurable: boolean;  // true = stripped on community upload
              default?: any;
            };
          };
          refreshInterval?: number; // Auto-refresh ms (e.g., 30000)
        };
      };
      rateLimit?: {
        maxRequests: number;
        perSeconds: number;
      };
    };
  };

  // === USER-CONFIGURABLE PARAMETERS ===
  userConfig: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'string[]' | 'object';
      description: string;        // "Your stock symbols to track"
      required: boolean;
      default?: any;
      sensitive?: boolean;        // true = API keys, tokens. Never shared.
      example?: any;              // "['AAPL', 'GOOGL', 'TSLA']"
    };
  };

  // === AI HINTS (server-generated during review) ===
  ai?: {
    modificationHints?: string[];   // "Change colors in ui.tsx lines 12-20"
    extensionPoints?: string[];     // "Add list items by extending items array in logic.ts"
    similarTo?: string[];           // IDs of similar components (server-computed)
  };

  // === LAYOUT ===
  defaultSize: { cols: number; rows: number };  // In 8px grid units
  minSize?: { cols: number; rows: number };
}
```

### Fields the Server Generates/Enriches

These fields are NOT provided by the client on upload. The server populates them during review:

| Field | When Generated | How |
|---|---|---|
| `id` | On approval | Server assigns UUID |
| `version` | On approval | Auto-incremented for same-name same-author |
| `ai.modificationHints` | Review Stage 5 (Manifest Enrichment) | LLM analyzes code structure |
| `ai.extensionPoints` | Review Stage 5 (Manifest Enrichment) | LLM identifies extension patterns |
| `ai.similarTo` | Review Stage 7 (Embedding) | pgvector nearest neighbors |

### Fields the Client Provides on Upload

Everything except the server-generated fields above. The client's AI agent generates the full manifest alongside the component code.

---

## 5. Data Bridge & Permissions

### How Components Access External Data

Components run in a sandboxed iframe with **zero network access**. All external data goes through the host's Data Bridge proxy:

```
Component (sandbox)
  → bridge.fetch("yahoo-finance", "quotes", { symbols: "AAPL,GOOGL" })
  → postMessage to host
  → Host checks: manifest declares this source? User approved? Rate limit OK?
  → Host makes actual HTTP request
  → Host returns sanitized response to sandbox
  → Component renders data
```

### What the Server Needs to Know

**1. Validate `dataSources` during review:**
- Check that `baseUrl` values are not known malicious domains
- Verify the component only accesses data through `bridge.fetch()` / `bridge.subscribe()`, never through hardcoded `fetch()`, `XMLHttpRequest`, `WebSocket`, or any other network API
- Flag components that try to bypass the bridge

**2. Validate `userConfig` during review:**
- Check that `sensitive: true` fields are not hardcoded in source code
- Verify sensitive values are only accessed via `bridge.getConfig(key)`, never imported or inlined
- Flag any hardcoded API keys, tokens, or credentials in source code

**3. Strip user data on community storage:**
- `userConfig` values are stripped before the component enters the community DB
- The schema (type, description, required, example) is preserved — only the actual VALUES are removed
- `dataSources` declarations are preserved as-is (they describe what APIs the component uses, not the user's specific data)
- The component's `context.md` may reference user-specific data in the conversation history — the review agent should flag any sensitive PII but NOT reject based on conversational tone

**4. Index `dataSources` for search:**
- A component's data source types should be searchable: "find components that use weather APIs" should surface components with weather-related `dataSources`
- The composite embedding should include data source descriptions

### Example: What Gets Stored vs Stripped

**Uploaded by user:**
```json
{
  "userConfig": {
    "symbols": {
      "type": "string[]",
      "description": "Stock symbols to track",
      "required": true,
      "example": ["AAPL", "GOOGL"]
    }
  }
}
```
User's actual config value (stored locally only): `["AAPL", "GOOGL", "TSLA"]`

**Stored in community DB:**
```json
{
  "userConfig": {
    "symbols": {
      "type": "string[]",
      "description": "Stock symbols to track",
      "required": true,
      "example": ["AAPL", "GOOGL"]
    }
  }
}
```
Exact same schema — the values were never sent to the server. The schema tells the next user what to fill in.

---

## 6. Community Sharing (Default-On)

### Key Decision: Sharing is ON by Default

When a user accepts a component after iteration, it is **automatically queued for community upload and review**. Users can opt out:
- Per-component: "Keep Private"
- Per-project: project settings → "Private project"
- Global: app settings → "Don't share by default"

### Impact on Server

**High upload volume expected.** Every accepted component triggers an upload. The server should:
- Handle upload spikes efficiently (pg-boss queue handles this)
- Prioritize fast-pass for small/simple components
- Batch embedding generation where possible
- Return early 202 Accepted — never block the client

### What Gets Uploaded

```typescript
{
  manifest: ComponentManifest,    // Full manifest (userConfig values stripped)
  files: {                        // All component files
    "ui.tsx": "...",
    "logic.ts": "...",
    "types.ts": "...",
    "context.md": "...",          // Conversation history — preserved, indexed
    "manifest.json": "..."
  }
}
```

### What Does NOT Get Uploaded (Community)

- User's `userConfig` actual values (stock symbols, API keys, etc.)
- Sensitive credentials (never leave the client)
- Tab layout / grid positions (local concern)
- Project-level config
- Agent memories

### Versioning

Same-name uploads by the same author create **new versions**, not duplicates:
- Server detects: same `name` + same `authorId` = new version
- Previous versions remain accessible
- Search returns latest version by default
- `GET /api/components/:id/versions` for full history

---

## 7. Component Lifecycle

### Full Flow: Creation to Community

```
1. USER DESCRIBES COMPONENT
   "Show me a stock ticker for my portfolio"
        │
2. AI SEARCHES COMMUNITY DB
   Client: GET /api/components/search?q="stock ticker real-time prices"
   Server returns ranked blueprints with manifests
        │
3. AI GENERATES / MODIFIES COMPONENT
   Uses blueprint as base (if found) or generates from scratch
   Creates: ui.tsx, logic.ts, types.ts, context.md, manifest.json
        │
4. COMPONENT RENDERED ON SLATE
   Loaded into sandbox iframe via COMPONENT_LOAD message
   If dataSources declared → user sees permission prompt
   User approves data access → host proxy starts fetching
        │
5. USER ITERATES
   "Make the numbers bigger" → AI modifies ui.tsx → re-render
   "Add a sparkline chart" → AI modifies ui.tsx + logic.ts → re-render
   Each iteration updates context.md with the conversation
        │
6. USER ACCEPTS
   Component finalized → checkpoint saved locally
        │
7. COMMUNITY UPLOAD (default-on, async)
   Client: POST /api/components/upload { manifest, files }
   Client: GET /api/components/upload/:id/stream (SSE for progress)
        │
8. SERVER REVIEW (7 stages)
   manifest_validation → security_scan → dependency_check →
   quality_review → test_render → cataloging → embedding
        │
9. APPROVED → LIVE IN COMMUNITY DB
   Searchable by future users. AI hints populated.
   Author gets credit (contribution tracking).
```

### Component Retrieval Flow (Blueprint Pull)

```
1. Client AI searches: GET /api/components/search?q="..."
2. Server returns: ranked results with manifests (not full source)
3. Client AI evaluates manifests: which blueprint fits best?
4. Client fetches source: GET /api/components/:id/source
5. Server returns: full package { sourceCode files, manifest }
6. Client AI modifies the blueprint to fit user's request
7. Modified component rendered on Slate
```

---

## 8. Checkpointing & Versioning

### Checkpoint = Private Backup

Separate from community upload. Every user's component versions are backed up privately.

**When checkpoints are created (client-side):**
- User accepts a component after iteration
- Before a major modification to an accepted component
- Manual checkpoint by user
- Auto-interval during long sessions

**Upload to server:**
```
POST /api/checkpoints
{
  projectId: string,            // Client-generated project ID
  componentLocalId: string,     // Component ID within local project
  componentName: string,
  version: number,              // Sequential version number
  files: Record<string, string>, // Full package files
  manifest: ComponentManifest,
  description: string,          // AI-generated: "Added sparkline chart and color-coded changes"
  trigger: 'user-accepted' | 'manual' | 'before-major-change' | 'auto-interval'
}
```

**Retrieval:**
- `GET /api/checkpoints/:componentLocalId?projectId={pid}` — version list (no source, saves bandwidth)
- `GET /api/checkpoints/:componentLocalId/:version?projectId={pid}` — full checkpoint with source

**Important distinctions:**

| | Checkpoint (Private) | Community Upload (Public) |
|---|---|---|
| Purpose | User's backup + version history | Shared component library |
| Visibility | Private to user only | Public to all users |
| Review | No review | 7-stage review pipeline |
| Trigger | Automatic on accept | Automatic on accept (default-on) |
| Contains user data | Yes (userConfig values in files) | No (stripped) |
| Contains sensitive data | Yes (may reference in context.md) | Scrubbed |

Both happen simultaneously but are independent paths.

### Version Update Checking

```
POST /api/components/check-updates
Body: { componentIds: ["uuid1", "uuid2", ...] }
Response: {
  updates: [
    {
      id: "uuid1",
      currentVersion: "1.0.0",
      latestVersion: "2.0.0",
      changelog: "Added dark mode support and fixed responsive layout"
    }
  ]
}
```

Client polls on app launch + every 30 minutes. Never auto-updates — user decides.

---

## 9. Search Requirements

### How the Client Uses Search

The AI agent searches on behalf of the user. When a user says "add a todo list", the agent:

1. Generates a search query from user intent: `"todo list with add remove complete filter"`
2. Sends: `GET /api/components/search?q=...&limit=5`
3. Evaluates returned manifests — checks inputs/outputs compatibility with current Slate
4. Picks the best blueprint (or generates from scratch if none fit)
5. Fetches full source: `GET /api/components/:id/source`

### What Makes Search Good for CSlate

**Semantic understanding is critical.** Users won't search for "kanban board" — they'll say "something to track my tasks in columns." The embedding + search must understand intent, not just keywords.

**Manifest-aware ranking.** A component that has compatible inputs/outputs with what's already on the user's Slate should rank higher. The client can pass additional context in the future, but for v1, natural language query + tags + category filtering is sufficient.

### Search Response Must Include

For each result:
- `id` — to fetch full source
- `name`, `summary`, `description` — for AI to evaluate fit
- `tags`, `category`, `complexity` — for filtering
- `manifest` — **full manifest** so the AI can check input/output compatibility without fetching source
- `contextSummary` — AI-generated "why this was built" from context.md
- `relevanceScore` — vector similarity score
- `rating`, `downloadCount` — social proof
- `ai.modificationHints` — so the AI knows how to customize this blueprint

### Composite Embedding Should Include

When generating the embedding for a component, combine:
- `manifest.description` (primary signal)
- `manifest.name`
- `manifest.tags`
- AI-generated `summary` (from cataloging)
- Key terms extracted from `context.md`
- `dataSources` descriptions (so "weather widget" surfaces when searching for weather APIs)
- Input/output descriptions (so searching for "component that displays user data" finds components with user-related inputs)

---

## 10. Review Pipeline Requirements

### 7 Stages (Confirmed)

```
Stage 1: MANIFEST VALIDATION
  - Validate against @cslate/shared Zod schema
  - Check all required fields present
  - Validate field types and constraints
  - Verify files[] matches actual uploaded files

Stage 2: SECURITY SCAN
  - Check for: eval(), new Function(), dynamic import()
  - Check for: direct fetch(), XMLHttpRequest, WebSocket usage
    (must use bridge.fetch() / bridge.subscribe() instead)
  - Check for: Node.js API usage (fs, child_process, etc.)
  - Check for: Electron API usage (ipcRenderer, shell, etc.)
  - Check for: crypto miners, data exfiltration patterns
  - Check for: XSS vectors in rendered output
  - Check for: hardcoded sensitive values (API keys, tokens, passwords)
  - Verify component only accesses globals provided by sandbox runtime

Stage 3: DEPENDENCY CHECK
  - Validate npm dependencies against allowlist
  - Check CSlate component dependencies exist in DB
  - Flag unknown or suspicious packages
  - Check for known vulnerable package versions

Stage 4: QUALITY REVIEW (LLM-powered)
  - Code quality: readability, structure, best practices
  - React patterns: hooks usage, component structure, error boundaries
  - Tailwind usage: semantic tokens (bg-primary) not hardcoded (bg-blue-500)
  - Manifest accuracy: do declared inputs/outputs/events match actual code?
  - Context verification: does code align with requirements in context.md?
    (Flag contradictions, but never reject for messy conversation history)
  - dataSources validation: are declared APIs legitimate? Do baseUrls match known services?
  - userConfig validation: are sensitive fields properly handled via bridge.getConfig()?

Stage 5: MANIFEST ENRICHMENT (LLM-powered)
  - Generate ai.modificationHints: "Change colors in ui.tsx lines 12-20"
  - Generate ai.extensionPoints: "Add new data fields in types.ts interface"
  - These MUST be populated before approval — not async after

Stage 6: CATALOGING (LLM-powered)
  - Generate 1-2 sentence summary
  - Assign primary category and subcategory
  - Estimate complexity (simple/moderate/complex)
  - Extract/validate tags
  - Generate contextSummary from context.md ("why this was built")

Stage 7: EMBEDDING
  - Generate composite embedding from: description + name + tags + summary +
    context.md key terms + dataSources descriptions + input/output descriptions
  - Store in pgvector with cosine distance + HNSW index
  - Compute ai.similarTo (nearest neighbors)
```

### SSE Progress Stream

```
GET /api/components/upload/:id/stream
Content-Type: text/event-stream

data: {"stage":"manifest_validation","status":"in_progress"}
data: {"stage":"manifest_validation","status":"complete","result":"passed"}
data: {"stage":"security_scan","status":"in_progress","progress":0.3}
data: {"stage":"security_scan","status":"complete","result":"passed"}
data: {"stage":"dependency_check","status":"in_progress"}
...
data: {"stage":"embedding","status":"complete","result":"passed"}
data: {"stage":"complete","status":"approved","componentId":"uuid-here"}
```

Or on rejection:
```
data: {"stage":"security_scan","status":"complete","result":"failed","issues":["Direct fetch() call found in logic.ts:42","Hardcoded API key in logic.ts:7"]}
data: {"stage":"complete","status":"rejected","reasons":["Security: unauthorized network access","Security: hardcoded credentials"]}
```

### What "Test Render" Means (Stage 5 Renamed to Compilation Check)

Per server team decision, "test render" = TypeScript compilation + import resolution + React JSX validity + dependency allowlist check. **No headless browser, no runtime execution.** The client sandbox is the real visual test.

---

## 11. API Contract Summary

### Authentication
```
Authorization: ApiKey <api_key>

POST   /api/auth/register       → { apiKey, user }
POST   /api/auth/regenerate     → { apiKey }
DELETE /api/auth/account
```

### Component Search & Retrieval
```
GET  /api/components/search?q={query}&tags={tags}&category={cat}&limit={n}&minRating={r}&sortBy={sort}
GET  /api/components/:id
GET  /api/components/:id/source              → { files, manifest }
GET  /api/components/:id/versions
GET  /api/components/trending?period=week
GET  /api/components/popular
GET  /api/components/tags
GET  /api/components/categories
POST /api/components/:id/rate               → { rating: 1-5, comment? }
POST /api/components/check-updates          → { componentIds: [] }
```

### Community Upload
```
POST /api/components/upload                 → 202 { uploadId, status }
GET  /api/components/upload/:id/status      → { status, reviewResult }
GET  /api/components/upload/:id/stream      → SSE (7 review stages)
```

Upload payload:
```typescript
{
  manifest: ComponentManifest,
  files: Record<string, string>   // path → content map
}
```

### Checkpoint Backup (Private)
```
POST   /api/checkpoints
GET    /api/checkpoints/:componentLocalId?projectId={pid}
GET    /api/checkpoints/:componentLocalId/:version?projectId={pid}
DELETE /api/checkpoints/:componentLocalId/:version?projectId={pid}
```

Checkpoint payload:
```typescript
{
  projectId: string,
  componentLocalId: string,
  componentName: string,
  version: number,
  files: Record<string, string>,
  manifest: ComponentManifest,
  description: string,
  trigger: 'user-accepted' | 'manual' | 'before-major-change' | 'auto-interval'
}
```

### User Profile
```
GET   /api/users/me
GET   /api/users/me/components
GET   /api/users/me/checkpoints
PATCH /api/users/me
```

### Error Format
```typescript
{
  error: {
    code: string,      // "COMPONENT_NOT_FOUND", "REVIEW_REJECTED", etc.
    message: string,
    details?: any
  },
  statusCode: number
}
```

### Rate Limits
| Endpoint | Limit |
|---|---|
| Search | 100 req/min |
| Retrieval | 120 req/min |
| Upload | 10 req/hour |
| Checkpoint upload | 60 req/hour |
| Checkpoint retrieval | 120 req/min |

### Upload Size Limits
| Limit | Value |
|---|---|
| Per file | 500 KB |
| Total package | 2 MB |
| Manifest | 50 KB |

---

## 12. Shared Package (@cslate/shared)

Own repo: `CSlate-shared`. Both client and server pin to specific versions.

Contains:
```
@cslate/shared
├── schemas/
│   ├── manifest.ts          // Zod schema for ComponentManifest (full spec above)
│   ├── checkpoint.ts        // Zod schema for checkpoint payloads
│   ├── api.ts               // Zod schemas for all API request/response bodies
│   └── errors.ts            // Error code enum and types
├── types/
│   └── index.ts             // TypeScript types inferred from Zod schemas
└── package.json
```

**Single source of truth:** Runtime validation + TypeScript types + (optionally) OpenAPI docs all generated from the same Zod definitions.

---

## 13. Server Tech Decisions (Confirmed)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Hono | RPC type safety via `hono/client` |
| ORM | Drizzle | First-class pgvector support |
| Database | PostgreSQL + pgvector on Neon | Serverless, scales to zero |
| File Storage | Cloudflare R2 | S3-compatible, no egress fees |
| Job Queue | pg-boss | Postgres-backed, no Redis needed |
| Auth | API key | Simple for MVP, migration path to OAuth |
| Review LLM | Server-owned (Claude or GPT-4o) | Evaluating — not user-configured |
| Embedding | text-embedding-3-small (1536 dims) | Evaluating — cost-effective |
| Search | Cosine distance + HNSW index | Fast approximate nearest neighbor |

---

## 14. Open Items & Future Coordination

### Items Needing Coordination

1. **@cslate/shared repo creation** — Needs to happen before either side starts implementation. Client and server must agree on initial Zod schemas.

2. **dataSources URL allowlist** — Should the server maintain a list of known-safe API domains? Or is any URL acceptable if the component passes security review? Recommend: soft allowlist for common APIs (Yahoo Finance, OpenWeatherMap, GitHub, etc.) with manual review for unknown domains.

3. **Embedding tuning** — The composite embedding formula (what text gets embedded, with what weights) should be tuned iteratively. Start with equal weight, adjust based on search quality feedback.

4. **Community moderation** — Beyond automated review, will there be human moderation? Flagging mechanism? Report abuse endpoint? Recommend adding `POST /api/components/:id/report` to the API.

### Future Coordination Points (v2)

- **OAuth flow support** — Server needs to support OAuth token exchange for data sources like Google, GitHub. Client will redirect user to OAuth flow, server stores tokens.
- **MCP server integration** — Client will support MCP servers as data source plugins. Server may need to understand MCP tool schemas for indexing.
- **WebSocket support** — Real-time data streaming for components. Server may need to proxy or manage WebSocket connections.
- **Component dependencies** — When a component depends on other CSlate components, the server needs to resolve and bundle the dependency tree on retrieval.
- **Author profiles** — Public author pages showing contributions, reputation, top components.
