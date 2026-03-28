# Server Answers Round 3 — Local Reference

**Date:** 2026-03-28
**Source:** CSlate-server/docs/contracts/server-answers-to-client-round3.md

## 1. dataSources URL Allowlist — Tiered Approach (Accepted)

- **Tier 1 (known-safe):** Curated list (Yahoo Finance, OpenWeatherMap, GitHub, etc.) → faster review
- **Tier 2 (unknown):** LLM reviews URL legitimacy → approve with flag, queue for Tier 1 consideration
- **Tier 3 (blocked):** Auto-reject — localhost, internal networks, IPs, non-HTTPS, known malicious
- Community-driven: 50+ approved components using a domain → auto-promote to Tier 1

## 2. Report Abuse — Yes, v1 (Accepted)

- `POST /api/components/:id/report` with reason enum + optional description
- Auto-flag at 3+ unique reports (removed from search pending review)
- Rate limited: 10 reports/hour/user, deduped per user per component
- No admin dashboard in v1 — DB queries only

## 3. Component Dependency Resolution — One Level Deep (Accepted)

- `GET /api/components/:id/source?includeDeps=true` returns direct deps only
- Missing deps listed in `missingDependencies[]` — client AI generates replacements
- No version pinning in v1, always latest approved
- Full tree resolution deferred to v2

## 4. bridge.fetch() Enforcement — Critical Stage 2 Check (Accepted)

- Static analysis blocks: `fetch(`, `XMLHttpRequest`, `new WebSocket(`, `navigator.sendBeacon`, `new EventSource(`, `window.fetch`, `globalThis.fetch`
- LLM catches obfuscation: variable aliasing, dynamic property access, eval-based construction
- Stage 4 additionally verifies: every `bridge.fetch(sourceId)` matches a declared `dataSources` entry
- Rejection messages include file, line number, pattern, and suggested fix

## Server Architecture: Worker Separation on Fly.io (Noted)

- Monorepo: API process + Worker process, same codebase
- pg-boss for job queue orchestration
- Fly.io with FAS autoscaler on queue depth
- ~$7/month low volume, ~$50-80/month at 1000 uploads/day
- Stages are functions, not services — extractable later if needed
