# Decision 003: Desktop Runtime Selection

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate needs a desktop runtime that supports TypeScript + React frontend, TypeScript backend, efficient resource usage, and safe rendering of user-generated components.

## Options Evaluated

### A) Electron

| Dimension | Rating | Notes |
|---|---|---|
| Performance | B+ | ~150-200 MB baseline RAM. Full Chromium = consistent rendering |
| Ecosystem | A+ | 120k stars, VS Code/Slack/Discord/Cursor built on it |
| DX | A | First-class TS + React + Vite. Chrome DevTools built-in |
| Security | B+ | Chromium sandbox, webview isolation, CSP. Requires architecture but has building blocks |
| Native Access | A+ | Most comprehensive native API surface |
| Extensibility | A | Webviews, child processes, full Node.js |
| Build Size | B- | 200-350 MB distributed app |
| Long-term | A+ | VS Code alone guarantees decade+ investment |

**Strengths:**
- Full Chromium = identical rendering across all platforms (huge for CSlate where AI-generated components must look the same everywhere)
- Node.js in main process = TypeScript backend runs natively, no sidecar needed
- `sandbox: true` + `nodeIntegration: false` + `contextIsolation: true` = turnkey sandboxing for user-generated code
- Cursor (AI code editor, closest analog to CSlate) is built on Electron
- Largest ecosystem, most battle-tested at scale

**Weaknesses:**
- Heavy: ~150-200 MB RAM baseline, 200+ MB app size
- Each app bundles its own Chromium

### B) Tauri v2

| Dimension | Rating | Notes |
|---|---|---|
| Performance | A | ~30-40 MB RAM. 3-10 MB app size |
| Ecosystem | B+ | 105k stars, growing fast, CrabNebula backing |
| DX | B | Good React/TS support, but Rust required for backend customization |
| Security | B | Strong capability model, but no turnkey sandbox for untrusted code |
| Native Access | A- | Comprehensive via plugin system |
| Extensibility | B+ | Plugin system, sidecar support |
| Build Size | A+ | 3-10 MB distributed app |
| Long-term | A- | Active development, commercial backing |

**Strengths:**
- Dramatically smaller footprint (30x smaller app, 5x less RAM)
- Strong capability-based permission system per webview
- Sidecar support for TypeScript backend via Node.js/Bun binary
- Built-in auto-updater

**Weaknesses:**
- **Cross-platform rendering inconsistency** (WebKit on macOS, Chromium on Windows, WebKitGTK on Linux) — AI-generated components may look different on each OS
- **Rust requirement** for any backend customization beyond the sidecar
- **No turnkey sandbox** for untrusted code (Delta Chat needed extensive manual hardening + security audit)
- Sidecar adds ~40-80 MB, partially negating size advantage
- Linux WebKitGTK experience is weakest

### C) Tauri + Node.js Sidecar (Hybrid)

Same as Tauri but with TypeScript backend preserved via compiled Node.js sidecar.

**Additional trade-offs:**
- Adds packaging complexity (pkg/bun compile + target triples)
- Communication overhead (TCP sockets recommended over stdio)
- Process lifecycle management is manual
- Total size: ~65-90 MB (still smaller than Electron)

### D) Neutralinojs — Not Recommended

- No TypeScript backend runtime
- No sandboxing
- Small ecosystem (8.4k stars)
- Supply chain attack history
- No major production apps

### E) Wails — Not Suitable

- **Go backend required** — dealbreaker for all-TypeScript stack

### F) Electrobun — Watch List

- TypeScript-everywhere (Bun backend), ~14 MB, <50ms startup
- **Beta status** — not production-ready
- Worth watching for 6-12 months

## Analysis for CSlate's Specific Needs

### Critical Requirement: Rendering User-Generated Components

CSlate's core value prop is rendering AI-generated React components on a canvas. This makes **rendering consistency** the #1 technical concern:

| | Electron | Tauri |
|---|---|---|
| Rendering engine | Chromium (same on all platforms) | WebKit (mac), Chromium (win), WebKitGTK (linux) |
| CSS/JS consistency | Identical across platforms | Varies by platform |
| Component looks same everywhere? | Yes | No — requires cross-platform QA |

For an app where **the entire UX is rendering dynamic, AI-generated UI**, having one rendering engine everywhere is a massive advantage.

### Critical Requirement: Sandboxing User Code

| | Electron | Tauri |
|---|---|---|
| Built-in sandbox | `sandbox: true` + `nodeIntegration: false` | No built-in sandbox |
| Effort to sandbox | Moderate (use webview + CSP) | High (manual hardening, platform-specific) |
| Production examples | VS Code extensions, Cursor | Delta Chat (required security audit) |

### TypeScript Backend

| | Electron | Tauri |
|---|---|---|
| Backend runtime | Node.js (native, in main process) | Rust (sidecar for TS) |
| TS backend complexity | Zero — just write TypeScript | High — compile to binary, manage sidecar lifecycle |

### Resource Usage (The Tauri Advantage)

| | Electron | Tauri |
|---|---|---|
| RAM baseline | ~150-200 MB | ~30-40 MB |
| App size | ~200-350 MB | ~3-10 MB (+ sidecar) |

This is where Tauri clearly wins. However, CSlate is a desktop app builder — users will be on capable machines, and the resource difference is acceptable.

## Recommendation: Electron

**Rationale:**

1. **Rendering consistency is non-negotiable for CSlate.** When an AI generates a component and the user iterates on it, it must look the same on every platform. Chromium everywhere guarantees this. Tauri's triple-engine approach would introduce visual bugs that erode trust in the platform.

2. **Sandboxing is simpler.** Electron's `sandbox: true` + `nodeIntegration: false` + `contextIsolation: true` gives us process-level isolation out of the box. Tauri requires extensive manual hardening.

3. **TypeScript backend runs natively.** No sidecar compilation, no process management, no communication protocol. Just TypeScript in the main process.

4. **Ecosystem validation.** Cursor (the closest analog — an AI-powered editor that renders dynamic content) chose Electron. VS Code's extension sandboxing is a proven model for our component sandboxing.

5. **The size/memory trade-off is acceptable.** CSlate users are building apps — they have capable machines. 200 MB app size and 150 MB RAM are within normal expectations (VS Code uses 300-500 MB).

6. **Risk reduction.** Electron has the lowest technical risk. More documentation, more examples, more developers who know it, more production apps validating the approach.

**When to reconsider:**
- If Electrobun reaches stable and proves cross-platform rendering consistency
- If Tauri ships a built-in sandbox mode (open since 2022, no timeline)
- If CSlate pivots to mobile-first (neither Electron nor Tauri is ideal for mobile)
