# Decision 012: Client/Server Contract Alignment

**Date:** 2026-03-28
**Status:** Accepted

## Context

After the initial API contract draft, the server team reviewed and provided feedback. This document captures the agreements, disagreements resolved, and final aligned decisions.

## Agreements (No Changes Needed)

- All 7 server responsibilities confirmed
- All endpoint structure (search, retrieval, upload, checkpoints, user)
- Upload lifecycle: 202 → async → poll
- Error handling format and codes
- Rate limiting (search bumped from 60 → 100 req/min)

## Disagreement 1: Multi-File Component Packages (ACCEPTED)

### Before
```typescript
{ sourceCode: string, manifest: ComponentManifest }
```

### After
```typescript
{ manifest: ComponentManifest, files: Record<string, string> }
```

Components are structured packages, not single strings:

```
my-component/
├── ui.tsx              # Visual React component
├── logic.ts            # Business logic, hooks, data transforms
├── types.ts            # TypeScript interfaces
├── context.md          # AI conversation history / decisions
└── manifest.json       # Component manifest
```

### Rationale
- AI agents need to know which file to modify for visual vs behavioral changes
- Review agent can validate structure (security checks on logic.ts, visual checks on ui.tsx)
- `context.md` preserves the conversation/decisions that shaped the component — CSlate's differentiator
- Community users can understand WHY a component was built a certain way

### Impact on Client
- Component builder skill generates multi-file output
- Local storage structure already supports this (components/ directory)
- Sandbox iframe loads ui.tsx as entry point, imports from logic.ts and types.ts
- Checkpoint backups include all files in the package

## Disagreement 2: API Key Auth for MVP (ACCEPTED)

### Before
JWT with refresh tokens.

### After
API key stored in Electron's `safeStorage`.

### Rationale
- Desktop app — no browser session management needed
- `safeStorage` uses OS-level encryption (Keychain on macOS, DPAPI on Windows)
- No refresh token rotation, no session expiry headaches
- Simpler client implementation for MVP
- Clean migration path to JWT/OAuth in Phase 2 (for web client, team features)

### Impact on Client
```typescript
// Auth header changes from:
Authorization: Bearer <jwt_token>
// To:
Authorization: ApiKey <api_key>

// Key stored via Electron safeStorage
import { safeStorage } from 'electron';
const encryptedKey = safeStorage.encryptString(apiKey);
// Store encrypted buffer, decrypt when needed
```

### Endpoints Change
```
POST /api/auth/register     // Returns API key
POST /api/auth/regenerate   // Invalidate old key, get new one
DELETE /api/auth/account     // Delete account + all data
// No more: login, refresh
```

## Disagreement 3: Extended ComponentManifest (ACCEPTED)

### New Fields Added

```typescript
interface ComponentManifest {
  // ... existing fields (id, name, description, tags, inputs, outputs, events, actions, defaultSize, minSize) ...

  // NEW: Package structure
  files: {
    path: string;            // e.g., "ui.tsx", "logic.ts"
    type: 'ui' | 'logic' | 'types' | 'context' | 'style' | 'test' | 'other';
    role: string;            // Human-readable: "Main visual component", "Business logic hooks"
  }[];

  // NEW: Compound component anatomy
  anatomy?: {
    parts: string[];         // Named sub-parts: ["header", "body", "footer", "action-bar"]
    slots?: string[];        // Named insertion points: ["header-right", "body-content"]
  };

  // NEW: Dependencies
  dependencies?: {
    cslateComponents?: string[];   // Other CSlate component IDs this depends on
    npmPackages?: {
      name: string;
      version: string;       // Semver range
    }[];
  };

  // NEW: AI hints (generated/enriched by server during review)
  ai?: {
    modificationHints?: string[];    // "Change colors in ui.tsx lines 12-20"
    extensionPoints?: string[];      // "Add new list items by extending the items array in logic.ts"
    similarTo?: string[];            // IDs of similar components (server-computed)
  };
}
```

### Rationale
- `files[]` — AI knows which file to modify for which type of change
- `anatomy` — Enables structural similarity search ("find components with a header + body + footer layout")
- `dependencies` — Server can check if dependencies are available, client can pre-install npm packages
- `ai` — Server review agent enriches the manifest with hints that make future AI modifications faster and more accurate. This is a massive value-add for the community library.

## Server Tech Stack (Confirmed)

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Hono** | RPC type safety with Electron client via `hono/client` |
| ORM | **Drizzle** | First-class pgvector support, type-safe |
| Database | **PostgreSQL + pgvector on Neon** | Serverless Postgres, scales to zero |
| File Storage | **Cloudflare R2** | S3-compatible, no egress fees |
| Job Queue | **pg-boss** | Postgres-backed, no Redis dependency |
| Auth | **API key** | Simple for MVP, safeStorage on client |
| Review LLM | **Server-owned** (Claude or GPT-4o, evaluating) | Not user-configured |
| Embedding Model | **text-embedding-3-small** (1536 dims, evaluating) | Cost-effective, good quality |
| Search | **Cosine distance + HNSW index** | Fast approximate nearest neighbor |

## Server Additions the Client Must Support

### 1. SSE for Review Progress (Day 1, Not Future)

```
GET /api/components/upload/:id/stream
Content-Type: text/event-stream

data: { "stage": "security_scan", "status": "in_progress", "progress": 0.3 }
data: { "stage": "security_scan", "status": "complete", "result": "passed" }
data: { "stage": "quality_check", "status": "in_progress", "progress": 0.1 }
...
data: { "stage": "complete", "status": "approved", "componentId": "uuid" }
```

### 2. Review Pipeline is 7 Stages (Not 4)

Client must display all stages in the upload progress UI:

```typescript
type ReviewStage =
  | 'manifest_validation'    // Stage 1: Validate manifest schema + completeness
  | 'security_scan'          // Stage 2: Check for malicious patterns
  | 'dependency_check'       // Stage 3: Validate dependencies are safe/available
  | 'quality_review'         // Stage 4: Code quality assessment
  | 'test_render'            // Stage 5: Server-side test render
  | 'cataloging'             // Stage 6: AI summarization + categorization
  | 'embedding';             // Stage 7: Vector embedding generation
```

### 3. Shared Zod Schemas

Both client and server validate manifests from the same source. This will be a shared npm package:

```
@cslate/shared
├── schemas/
│   ├── manifest.ts          // Zod schema for ComponentManifest
│   ├── checkpoint.ts        // Zod schema for checkpoints
│   └── api.ts               // Zod schemas for API request/response
├── types/
│   └── index.ts             // TypeScript types derived from Zod schemas
└── package.json
```

### 4. Rating Endpoint

```
POST /api/components/:id/rate
{ rating: 1-5, comment?: string }
```

Client needs a rating UI after using a community component.

### 5. Upload Size Limits

| Limit | Value |
|---|---|
| Per file | 500 KB |
| Total package | 2 MB |
| Manifest | 50 KB |

Client must validate before upload and show clear errors if exceeded.

### 6. Component Versioning

Same-name uploads by the same author create new versions, not duplicates:
- `POST /api/components/upload` with same `name` + same `authorId` → new version
- Previous versions remain accessible
- Search returns latest version by default
- Users can browse version history of community components
