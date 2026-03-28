# Decision 006: Component Sandboxing Architecture

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate renders AI-generated and community-sourced React components on a canvas. These components are potentially untrusted — even with server-side review, we need client-side defense-in-depth. The challenge: we may have 50+ components on one canvas, and they need to communicate.

## Options Evaluated

### One iframe Per Component
- Strong isolation per component
- **Rejected:** At 50+ components, 50+ separate JS runtimes destroy performance (memory, CPU, IPC)

### WebContentsView Per Component (Electron)
- Strongest isolation (OS-level process boundary)
- **Rejected:** Each is ~30-50 MB RAM. 50 components = 1.5-2.5 GB. Completely unscalable.

### Pure SES/Compartments (In-Process)
- Zero overhead, fine-grained control
- **Rejected alone:** Running untrusted code in the host renderer is one misconfiguration from disaster. Needs a hard boundary.

### Single Sandbox iframe + SES Compartments (Selected)
- One iframe = one hard security boundary (performance-friendly)
- SES Compartments inside = per-component isolation (defense-in-depth)
- **Selected:** Best balance of security and performance

## Decision

**"Single Sandbox iframe + SES Compartments" architecture**

```
+------------------------------------------------------------------+
|  ELECTRON MAIN PROCESS (Node.js, trusted)                        |
|  - Window management, file system, IPC hub                       |
+------------------------------------------------------------------+
        |  IPC (contextBridge)
        v
+------------------------------------------------------------------+
|  HOST RENDERER (React app, trusted)                              |
|  - Slate canvas, grid layout, AI chat, toolbar                   |
|  - Component registry & state manager (Zustand)                  |
|  - DOES NOT render untrusted components directly                 |
+------------------------------------------------------------------+
        |  postMessage (MessageChannel)
        v
+------------------------------------------------------------------+
|  SANDBOX IFRAME (single, sandbox="allow-scripts", null origin)   |
|  - Thin runtime: React, SES lockdown, component loader           |
|  - Each component in its own SES Compartment                     |
|  - Components share one React render tree (performance)          |
|  - near-membrane proxies scope each component's DOM access       |
|  - NO access to Node.js, Electron APIs, fetch, localStorage      |
+------------------------------------------------------------------+
```

## Security Layers

### Layer 1: iframe Boundary (Hard Security)
- `sandbox="allow-scripts"` — scripts run but everything else blocked
- Null origin — no access to host cookies, storage, DOM
- Even if all SES guards fail, attacker is trapped in a null-origin iframe
- Cannot reach Node.js, filesystem, or Electron APIs

### Layer 2: SES Compartments (Defense-in-Depth)
- `lockdown()` called at iframe boot — freezes all JS intrinsics
- Each component evaluates in its own `Compartment` with curated globals
- Components get: `React`, `createElement`, their own root element, scoped event emitter, `props` proxy
- Components do NOT get: `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `Function`, `import()`, `localStorage`, `document.cookie`, `window.open`

### Layer 3: near-membrane DOM Scoping
- Proxy-based membrane gives each component a scoped DOM view
- Component A cannot access Component B's DOM subtree
- Same technology used by Salesforce LWC in production at scale
- ~5-15% overhead on DOM operations (negligible for typical UI)

## Communication Protocol

```
Host Renderer                    Sandbox iframe
     |                                |
     |-- STATE_UPDATE {id, props} --> |  (new props for component)
     |                                |-- renders with new props
     |                                |
     |<-- EVENT {id, type, data} ---  |  (component emits event)
     |                                |
     |-- COMPONENT_LOAD {id, code} -> |  (load component source)
     |                                |-- Compartment.evaluate(code)
     |                                |-- mount in scoped root div
     |                                |
     |-- COMPONENT_REMOVE {id} -----> |  (unmount component)
```

- All via `MessageChannel` (not broadcast postMessage)
- Messages are structured-clone serializable (no functions, no DOM nodes)
- Host maintains source of truth for all state
- Components request changes by emitting events; host decides whether to apply

## Inter-Component Communication

Components communicate **through the host**, not directly:
1. Component A emits `EVENT {type: "filter-changed", data: {value: "active"}}`
2. Host state manager routes to Component B (if configured)
3. Component B receives updated props via `STATE_UPDATE`

This prevents components from directly accessing each other while enabling rich interactions.

## Security Threat Mitigation

| Attack Vector | Mitigation |
|---|---|
| Access Node.js / Electron APIs | iframe sandbox (null origin, no nodeIntegration) |
| Access host app DOM / state | iframe cross-origin boundary |
| Component A accesses Component B's DOM | near-membrane proxy scoping |
| Data exfiltration via fetch/XHR | No network APIs in Compartment globals |
| Prototype pollution | SES `lockdown()` freezes all intrinsics |
| eval / dynamic code generation | Removed from Compartment globals |
| Infinite loops / CPU abuse | iframe removal as kill switch + monitoring |
| Memory exhaustion | `performance.measureUserAgentSpecificMemory()` + threshold |

## Performance Considerations

| Concern | Mitigation |
|---|---|
| Single iframe = single JS thread | Virtualize off-screen components, React reconciler handles 50+ |
| SES lockdown startup | ~50-100ms once at boot. Compartments ~1-5ms each |
| near-membrane overhead | 5-15% on DOM ops. Negligible for UI components |
| postMessage serialization | Batch state updates, send diffs not full state |

## Key Libraries

| Library | Purpose | Maturity |
|---|---|---|
| `@endo/ses` | lockdown() + Compartment | Production (Agoric, MetaMask) |
| `near-membrane` | Proxy-based DOM scoping | Production (Salesforce LWC) |
| React 18+ | Shared render tree in sandbox | Production |
| MessageChannel API | Host ↔ sandbox communication | Web standard |

## Critical Rules

1. **Never** `allow-same-origin` in sandbox iframe (allows removing own sandbox)
2. **Never** render untrusted code in the host renderer
3. **Never** give components direct `fetch` access (prevents data exfiltration)
4. **Never** one iframe/WebContentsView per component (doesn't scale)
5. **Always** route inter-component communication through the host

## Implementation Phases

1. **Phase 1:** Sandbox iframe + basic isolation + postMessage protocol
2. **Phase 2:** SES lockdown + Compartments per component
3. **Phase 3:** near-membrane DOM scoping
4. **Phase 4:** Performance optimization (virtualization, batched updates)
