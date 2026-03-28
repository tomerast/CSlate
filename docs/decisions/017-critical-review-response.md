# Decision 017: Critical Review Response & Spec Amendments

**Date:** 2026-03-28
**Status:** Accepted

## Context

Four independent critical reviews of all 16 CSlate decisions identified real problems across architecture, component model, UX/product, and security. This document categorizes every finding and our response.

---

## CRITICAL ISSUES (Must Fix Before Implementation)

### C1. v1 Sandbox Has Zero Inter-Component Isolation

**Problem:** Without SES, all components share one JS context. Component A can keylog every input, read all Zustand state, hijack the bridge object, intercept postMessage, monkey-patch React.createElement, and manipulate other components' DOM.

**Response: Add "hardened iframe" as v1 minimum.** Not full SES, but:

1. **Freeze all intrinsic prototypes at iframe boot** — `Object.freeze(Object.prototype)`, `Array.prototype`, `Function.prototype`, `React`, `React.createElement`, the `bridge` object. This takes hours, not weeks. Blocks prototype pollution and React render tree poisoning.

2. **Shadow DOM per component** — Each component renders inside a Shadow Root. Native browser feature, zero perf overhead. Blocks cross-component DOM access, keylogging via document.addEventListener, and UI spoofing.

3. **Per-component MessagePorts** — Each component gets its own `MessageChannel` created at bootstrap before any component code loads. Components can only receive their own state updates and bridge responses. Blocks postMessage interception.

4. **Scoped bridge instances** — Each component receives a frozen `bridge` proxy scoped to its componentId. Host rejects bridge.fetch calls where sourceId doesn't match the component's manifest.

5. **CSP on sandbox iframe** — `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:;`. Blocks connect-src, worker-src, frame-src, media-src. Eliminates image pixel exfiltration, service workers, nested iframes.

6. **Components do NOT access Zustand directly** — State flows only through postMessage props. Components receive their declared `inputs` as props via STATE_UPDATE, nothing more. The store lives in the host, not the sandbox.

**This replaces the v1 sandboxing spec (Section 5 of design doc).**

### C2. Three Conflicting Coordinate Systems

**Problem:** Decision 005 uses `{ cols, rows }`, Decision 013 uses `{ x, y, width, height }` in grid units, Decision 011 uses `{ col, row, colSpan, rowSpan }`. Three different models.

**Response: Standardize on one system.** Use `{ x, y, width, height }` in grid units (8px each) as the canonical system everywhere. The manifest's `defaultSize` and `minSize` use `{ width, height }` only (no position — that's a placement concern, not a component concern).

```typescript
// Manifest (component-level, no position)
defaultSize: { width: number; height: number };  // in grid units
minSize?: { width: number; height: number };

// Tab config (placement-level)
interface ComponentPlacement {
  componentId: string;
  x: number;       // grid units from left
  y: number;       // grid units from top
  width: number;   // grid units
  height: number;  // grid units
}
```

No `cols/rows`, no `col/row/colSpan/rowSpan`. One system.

### C3. Absolute Positioning ≠ "Responsive by Default"

**Problem:** Decision 002 selected structured grid BECAUSE it produces "responsive, real-world layouts." Decision 013 implements absolute positioning with snap-to-grid, which doesn't reflow on window resize. These contradict.

**Response: Be honest.** v1 is absolute positioning with a clean grid. It is NOT responsive. Remove the "responsive by default" claim from Decision 002. Add to the spec:

- v1: Absolute positioning with 8px snap grid. Layouts are fixed to the canvas size they were created at.
- v2: Responsive layout engine with breakpoints, auto-reflow, container queries.

Users who resize their window will see components stay at their absolute positions. This is acceptable for v1 of a desktop app where the user controls their window size.

### C4. Client-Side URL Validation for Data Bridge

**Problem:** Server reviews URLs at upload time, but the client makes the actual fetch. DNS rebinding (domain resolves to public IP during review, then changed to 127.0.0.1) and local network SSRF are not blocked client-side.

**Response: Add client-side URL validation.** Before every bridge.fetch:
1. Resolve DNS to IP
2. Reject if IP is private (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
3. Reject if not HTTPS
4. Reject if URL matches Tier 3 blocklist

Independent of server validation. This blocks SSRF and DNS rebinding.

---

## HIGH ISSUES (Fix in Spec, Implement in v1)

### H1. Manifest-Code Synchronization Problem

**Problem:** The AI generates the manifest alongside the code. They will frequently be inconsistent — declared inputs don't match actual code, stateKeys are mistyped, events are declared but never emitted.

**Response: Two-pass generation.** The component-builder skill generates code first, then derives the manifest from code analysis (AST parse for bridge.fetch calls, store reads/writes, event emissions). The manifest is not co-generated — it's extracted. Add a `manifest-validator` step that checks manifest claims against actual code before rendering.

### H2. No Instance-Scoped State Keys

**Problem:** Two todo lists on the same Slate both write to `todoList`. No scoping mechanism for instances of the same component type.

**Response: Instance-prefixed state keys.** When a component is placed, the platform generates a unique instance ID. State keys are automatically prefixed: `todoList` becomes `comp_abc123.todoList`. The manifest declares the base key name, the platform handles scoping. Components never see the prefix — the bridge translates.

### H3. No Tailwind Token Enforcement

**Problem:** AI uses hardcoded Tailwind colors 5-15% of the time. One `bg-blue-500` breaks theming.

**Response: Post-generation lint + server review enforcement.**
- Client-side: After AI generates ui.tsx, run a regex/AST scan for raw color classes (bg-blue-*, text-red-*, etc.). Auto-replace with closest semantic token, or flag and ask AI to fix.
- Server-side: Quality review stage explicitly rejects components with hardcoded Tailwind colors. This is a hard rule, not a suggestion.
- Runtime fallback: In the sandbox, inject a CSS layer that maps common raw Tailwind colors to their token equivalents.

### H4. No Offline/Degradation Strategy

**Problem:** Desktop app with hard server dependency for search and retrieval. Doesn't work on an airplane.

**Response: Local cache + graceful degradation.**
- Cache last N search results and blueprints locally
- If server unreachable: show cached results, allow local-only component generation (AI still works — it's the user's LLM), queue uploads for later
- Never block the user because the server is down
- Show connection status indicator in the UI

### H5. No Component Revocation

**Problem:** A reviewed component has a vulnerability discovered after distribution. No way to recall it.

**Response: Add `POST /api/components/check-updates` already includes this.** Extend the update check response to include revocations:
```typescript
{
  updates: [...],
  revocations: [
    { id: "uuid", reason: "Security vulnerability discovered", revokedAt: "..." }
  ]
}
```
Client removes revoked components from the Slate and notifies the user. Pass to server team.

### H6. Permission Fatigue

**Problem:** 10 data-connected components = 10 blocking permission prompts. Users click Allow reflexively.

**Response: Tiered permissions + batching.**
- Tier 1 (server allowlist) domains: auto-approve with non-blocking toast ("Stock Ticker connected to Yahoo Finance")
- Batch prompts: if placing multiple components at once, show one combined permission screen
- Max 2 blocking prompts in a row — queue rest with "N more permissions pending"
- Color-code risk: green for Tier 1, yellow for Tier 2, red for unknown

---

## MEDIUM ISSUES (Spec Amendments, Some Deferred)

### M1. MVP Scope is Too Large (26 systems)

**Problem:** The "MVP" has 26 distinct systems. That's not minimal.

**Response: Partially agree. Define a "v0.1" inner MVP.**

**v0.1 (ship first):** macOS only, single LLM provider (Anthropic), no community upload, no tabs, simple prompt-based agent (no skills/memory system), single-file components, basic checkpoint saves.

**v1 (ship second):** Full cross-platform, multi-provider, community sharing, multi-file packages, tabs, agent skills + memory, data bridge.

This gives us a shippable product in weeks, then we layer on features. The spec describes v1 as the target architecture, but v0.1 is what we build first.

### M2. Agent Architecture is Overengineered

**Problem:** Skills, memory, workflows, sub-agents, MCP — this is a research paper, not an MVP.

**Response: Agree for v0.1.** v0.1 agent is a single LLM call with a good system prompt + component manifest schema + generate/iterate loop. No skills abstraction, no memory files, no workflows. The architecture in Decision 007 is the TARGET, not the starting point. We build toward it incrementally.

### M3. Multi-File Packages Overkill for Simple Components

**Problem:** 5 files for a clock widget. logic.ts and types.ts will be empty for most components.

**Response: Make logic.ts and types.ts optional.** Only generate when the component has non-trivial logic or shared types. Minimum viable package is ui.tsx + manifest.json. AI generates single-file by default, splits when complexity warrants.

```
// Simple component:
clock/
├── ui.tsx
├── context.md
└── manifest.json

// Complex component:
stock-ticker/
├── ui.tsx
├── logic.ts
├── types.ts
├── context.md
└── manifest.json
```

### M4. context.md Unbounded Growth

**Problem:** After 10 iterations, context.md hits 2000+ lines. Hits 500KB limit.

**Response: Summary strategy.** Keep last 5 interactions verbatim + condensed summary of earlier rounds. Cap at 50KB. AI generates summary before truncating older entries.

### M5. No Bridge Request Deduplication

**Problem:** 3 components all fetching Yahoo Finance for overlapping symbols = 3 separate HTTP requests.

**Response: Host-side cache + deduplication layer.**
- Cache bridge responses by (sourceId, endpointId, params hash) with TTL matching refreshInterval
- Deduplicate concurrent identical requests
- Return cached response for requests within refresh window

### M6. Default-On Sharing — GDPR Concern

**Problem:** Default-on sharing of user-created content including conversation history (context.md) may violate GDPR Article 7 (requires affirmative consent).

**Response: Change to opt-in with strong nudge.**
- First time: "Share with Community?" prominent button after accept (not default-on)
- After user has shared 3+ components: offer "Always share" toggle
- context.md: AI auto-generates a clean summary for sharing, does NOT share raw conversation
- Sensitive data scan before upload
- Clear onboarding explanation of what sharing means

This is a significant change from Decision 015. Better to be safe than face a privacy scandal.

### M7. BYO API Key Kills Non-Technical Onboarding

**Problem:** Getting an OpenAI/Anthropic API key requires a developer account, credit card, and understanding what an API key is. 80% of non-technical users will drop off.

**Response: Offer a hosted option for v1.**
- Free tier: CSlate provides limited LLM credits (N component generations per month)
- BYO key: for power users who want unlimited usage or specific models
- This is a business model decision, not just a technical one. Without it, the "non-technical users" claim is hollow.

### M8. No Error Recovery for Sandbox Crashes

**Problem:** If the sandbox iframe dies, all components lose in-flight state (scroll positions, form inputs, animations).

**Response:** Host maintains last-known props for all components. On sandbox crash:
1. Kill iframe
2. Create new iframe
3. Reload all components with last-known props
4. Show brief "Recovering..." overlay

Form inputs and scroll positions ARE lost. This is acceptable for v1. The host-side state (Zustand) persists across crashes.

### M9. No API Versioning Strategy

**Problem:** Client and server deploy independently. Breaking API changes will break old clients.

**Response:** URL-prefixed versioning: `/api/v1/components/search`. Server supports v1 indefinitely. New breaking changes go to /api/v2. Client pins to a specific API version.

### M10. No Canvas Size Limits

**Problem:** Infinite canvas with 100+ components. No virtualization discussed.

**Response:** Implement viewport-based virtualization. Only mount components visible in the viewport + a buffer zone. Unmount off-screen components. This is standard in any canvas/grid system and should be a v1 requirement.

---

## LOW ISSUES (Noted, Acceptable for v1)

- **Spacing unit (4px) vs grid unit (8px) confusion** — Eliminate the 4px spacing unit. Everything is 8px grid units. Tailwind spacing remains as-is (p-4 = 16px = 2 grid units).
- **Event bus ordering** — Acceptable at v1 scale (<10 interactive components). Add ordering guarantees in v2.
- **Linux safeStorage plaintext fallback** — Warn user, don't block. Document in security notes.
- **No maximum dataSources per component** — Add limit of 5 per component in manifest validation.
- **npm dependencies resolved at runtime** — Confirm all deps are bundled at generation time, never runtime-resolved.

---

## Summary of Spec Changes

| Change | Severity | Effort |
|---|---|---|
| Hardened iframe (freeze prototypes, Shadow DOM, per-component MessagePorts, scoped bridge, CSP) | Critical | 1-2 weeks |
| Standardize coordinate system to {x, y, width, height} | Critical | 1 day |
| Remove "responsive by default" claim, v1 is absolute positioning | Critical | Doc fix |
| Client-side URL validation for data bridge | Critical | 2-3 days |
| Two-pass manifest generation (code-first, then extract) | High | 1 week |
| Instance-scoped state keys | High | 2-3 days |
| Tailwind token lint + enforcement | High | 3-4 days |
| Offline cache + graceful degradation | High | 1 week |
| Component revocation via update check | High | 2-3 days |
| Tiered permissions + batching | High | 3-4 days |
| Define v0.1 inner MVP scope | Medium | Doc fix |
| Simplify agent to single-prompt for v0.1 | Medium | Simplification |
| Optional logic.ts/types.ts | Medium | 1 day |
| context.md summary + cap | Medium | 2-3 days |
| Bridge request deduplication | Medium | 2-3 days |
| Change sharing to opt-in with strong nudge | Medium | 1-2 days |
| Hosted LLM option | Medium | Business decision |
| Sandbox crash recovery | Medium | 3-4 days |
| API versioning | Medium | 1 day |
| Canvas virtualization | Medium | 1 week |
