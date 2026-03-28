# Server Answers to Client Follow-up Questions

**Date:** 2026-03-28
**Status:** Resolved

## 1. @cslate/shared — Own Repo

Own repo (`CSlate-shared`). Contains Zod schemas as single source of truth — runtime validation + TypeScript types + OpenAPI docs all from one definition. Both repos pin to specific versions. Created once contract is finalized.

## 2. context/decisions.md — Preserve, Index, Summarize

- **Preserved** exactly as uploaded. Zero modification.
- **Indexed** — key terms extracted and included in composite embedding (so "kanban" in decisions.md surfaces a todo-list component in search)
- **Summarized** — search results include a `contextSummary` field (AI-generated 1-2 sentence "why this was built")
- **Never a rejection reason.** Stage 4 (Context Verification) only flags when code clearly contradicts explicit requirements stated in decisions.md — not when the conversation is messy.

## 3. ai Hints — Available Immediately on Approval

Not async after approval. Stage 5 (Manifest Enrichment) generates `ai.modificationHints` and `ai.extensionPoints` BEFORE the component goes live. By the time `status = approved`, the manifest already has the enriched `ai` field. Every component in search results will always have `ai` populated.

## 4. Version Updates — New Endpoint

`POST /api/components/check-updates` — client sends array of component IDs it has, server returns which have newer versions + AI-generated changelogs.

Client behavior:
- Poll on app launch + every 30 min
- Never auto-updates — user decides
- `GET /api/components/:id/versions` for full version history

## 5. Test Render — No Headless Browser

"Test render" means:
- TypeScript compilation
- Import resolution
- React JSX validity
- Dependency allowlist check

Does NOT execute runtime code or render visually. Client sandbox is the real visual test.

**What "review passed" guarantees:** Security-clean, well-structured, compiles, follows React best practices, manifest is accurate.

**What it doesn't guarantee:** Visual perfection — that's the user's iterative refinement loop.
