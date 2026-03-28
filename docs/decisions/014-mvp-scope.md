# Decision 014: MVP (v1) Scope

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate has a large design surface. To ship, we need a tight MVP scope that delivers the core value loop: describe → generate → render → iterate → share.

## v0.1: Inner MVP (Pre-v1)

Before v1, ship the smallest thing that demonstrates the core value: describe → generate → render → iterate.

**v0.1 scope (macOS only):**

| Area | v0.1 |
|---|---|
| Platform | macOS only (single build target) |
| LLM | Single provider (Anthropic Claude API) |
| Agent | Single LLM call + system prompt (no skills/memory system) |
| Canvas | Fixed single slate (no tabs) |
| Components | Single-file (ui.tsx + manifest.json only) |
| Sandboxing | Basic iframe sandbox (no SES, no hardening) |
| Persistence | Local filesystem only (no cloud sync, no checkpoints) |
| Community | No upload, no search, no server integration |
| Styling | Tailwind + tokens (but no enforcement) |
| Auth | None (no server) |

**v0.1 success criteria:**
1. User opens app, presses `Cmd+K`, describes a component, sees it rendered
2. User can give feedback and see it updated in real-time
3. At least 5 different component types work correctly (form, chart, table, ticker, calendar)
4. Zero crashes on a 30-minute continuous session

**Why v0.1 matters:** 26 systems in the full v1 spec is too large to start. v0.1 validates the core hypothesis (AI → component → canvas) before building the surrounding platform. Each v1 feature is added after v0.1 proves the loop works.

## v1 — MVP Scope

### Core Experience
- Electron desktop app (macOS, Windows, Linux)
- Clean Slate canvas with 8px snap-to-grid system
- Browser-style tab bar (create, rename, reorder, close tabs)
- Dark/light theme toggle with design token system

### AI Interaction
- Floating AI chat: `Cmd+K` command bar → expandable side panel
- Natural language component generation
- Iterative refinement loop (user feedback → AI modifies → re-render)
- User-configurable LLM provider (API key + model selection in settings)
- Agent core identity: CSlate component builder
- Basic agent memory (user preferences, project context)

### Component System
- Multi-file component packages (ui.tsx, logic.ts, types.ts, context.md, manifest.json)
- Component manifest with inputs, outputs, events, actions, files, dependencies
- Tailwind CSS + design token styling (semantic token classes)
- Zustand state store (tab-scoped) for shared reactive state
- Typed event bus for cross-component notifications
- AI-powered component wiring (manifest-based input↔output matching)

### Sandboxing
- Hardened iframe: single sandbox iframe + frozen prototypes + Shadow DOM per component + per-component MessagePorts + scoped bridge + CSP
- Null origin, no Node.js access, no fetch
- postMessage/MessageChannel communication protocol
- Component isolation via Shadow DOM (closed) per component
- SES Compartments and near-membrane deferred to v2

### Data & Persistence
- Local filesystem project storage (cslate.json, tabs/, components/)
- Component checkpointing on accept + before major changes
- Version rollback UI (right-click → Version History → preview → restore)
- Async cloud checkpoint backup to CSlate Server

### Server Integration
- API key authentication (stored in Electron safeStorage)
- Component search: natural language query → ranked blueprint results
- Component retrieval: pull blueprint source code + manifest
- Component upload: async with SSE progress stream (7 review stages)
- Checkpoint backup: upload/retrieve/delete versioned snapshots
- Shared Zod schemas via @cslate/shared package

### Built-in Agent Skills (v1)
- `component-builder` — Generate/modify React component packages
- `component-search` — Query server DB for similar blueprints
- `manifest-generator` — Create/validate component manifests
- `layout-arranger` — Place components on the grid
- `feedback-iterator` — Refine components based on user input
- `state-wirer` — Connect components via store keys and event bus

## v2 — Deferred

### Enhanced Sandboxing
- SES `lockdown()` + Compartments per component
- near-membrane DOM scoping
- Per-component API allowlisting

### Agent Extensibility
- MCP server integrations for external data sources
- Custom user-defined skills and workflows
- Sub-agent spawning for complex tasks
- Agent personality customization

### Community Features
- Component rating UI (1-5 stars + comments)
- Version update notifications (`POST /api/components/check-updates`)
- Component version history browsing
- Author profiles and reputation

### Advanced UX
- Sidebar page navigation (Notion-style page tree)
- Voice input for AI chat
- Responsive breakpoints and auto-reflow
- Component overlap with z-index layer panel
- Tab templates (start from pre-built layouts)
- Slash commands in AI chat (`/search`, `/theme`, `/export`)

### Export & Deployment
- Export app as standalone package
- Deploy to web hosting
- Share app links

## Success Criteria for v1

1. User can open CSlate, press `Cmd+K`, describe a component, and see it rendered on the Slate
2. User can iterate on the component via conversation until satisfied
3. User can place multiple components on a tab and they communicate via shared state
4. User can search the community DB for blueprints and use them as starting points
5. User can upload finished components to the community DB
6. Components are checkpointed locally and backed up to the cloud
7. User can roll back any component to a previous version
8. The experience works with at least 2 LLM providers (OpenAI + Anthropic)
