# CSlate Server API Contract

**Date:** 2026-03-28
**Version:** 3.0 (Post Critical Review)
**Owner:** CSlate Client ↔ CSlate Server

---

## Server Responsibilities

1. **Community Component Library** — Store, index, and serve shared component packages
2. **Semantic Search** — Find similar components via pgvector (cosine + HNSW)
3. **Code Review Pipeline** — 7-stage AI review (security, quality, test render, cataloging, embedding)
4. **Component Cataloging** — Summarize, tag, categorize, and enrich with AI hints
5. **Embedding Generation** — text-embedding-3-small (1536 dims) for semantic search
6. **Checkpoint Backup** — Private versioned component backups per user
7. **User Management** — API key auth, component ownership, contribution tracking

## Server Tech Stack

| Layer | Choice |
|---|---|
| Framework | Hono (RPC type safety) |
| ORM | Drizzle (pgvector support) |
| Database | PostgreSQL + pgvector on Neon |
| File Storage | Cloudflare R2 |
| Job Queue | pg-boss |
| Auth | API key |
| Review LLM | Server-owned (Claude or GPT-4o) |
| Embedding | text-embedding-3-small |
| Search | Cosine distance + HNSW index |

---

## Authentication

API key based. Key stored in Electron's `safeStorage` on client.

```
Authorization: ApiKey <api_key>
```

```
POST   /api/v1/auth/register      // Create account, returns API key
POST   /api/v1/auth/regenerate     // Invalidate old key, get new one
DELETE /api/v1/auth/account        // Delete account + all data
```

---

## Shared Data Models

### ComponentManifest (Validated by @cslate/shared Zod schemas)

```typescript
interface ComponentManifest {
  id?: string;                   // UUID, assigned by server on upload
  name: string;
  description: string;
  tags: string[];
  version?: string;              // Semver, server tracks versions

  inputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;
      required: boolean;
      default?: any;
      stateKey?: string;
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

  files: {
    path: string;
    type: 'ui' | 'logic' | 'types' | 'context' | 'style' | 'test' | 'other';
    role: string;
  }[];

  anatomy?: {
    parts: string[];
    slots?: string[];
  };

  dependencies?: {
    cslateComponents?: string[];
    npmPackages?: { name: string; version: string }[];
  };

  ai?: {
    modificationHints?: string[];
    extensionPoints?: string[];
    similarTo?: string[];
  };

  defaultSize: { width: number; height: number };  // grid units
  minSize?: { width: number; height: number };      // grid units
}
```

### Component Package (Multi-File)

```typescript
interface ComponentPackage {
  manifest: ComponentManifest;
  files: Record<string, string>;  // path → content map
}

// Example:
{
  manifest: { /* ... */ },
  files: {
    "ui.tsx": "import React from 'react';\n...",
    "logic.ts": "export function useTodoLogic() {...}",
    "types.ts": "export interface TodoItem {...}",
    "context.md": "## Decisions\n- User wanted drag-and-drop..."   // AI-generated clean summary of the build conversation (not raw chat). Generated locally by client before upload. Max 2,000 chars.
  }
}
```

### Upload Size Limits

| Limit | Value |
|---|---|
| Per file | 500 KB |
| Total package | 2 MB |
| Manifest | 50 KB |

**Manifest validation notes:**
- Maximum 5 `dataSources` per component manifest. Manifests with more are rejected with `TOO_MANY_DATA_SOURCES`.

---

## API Endpoints

### Component Search & Retrieval

```
GET  /api/v1/components/search?q={query}&tags={tags}&category={cat}&limit={n}
GET  /api/v1/components/:id
GET  /api/v1/components/:id/source         // Returns full package (files + manifest)
GET  /api/v1/components/:id/versions       // Version history for a component
GET  /api/v1/components/trending?period=week&limit=20
GET  /api/v1/components/popular?limit=20
GET  /api/v1/components/tags
GET  /api/v1/components/categories
POST /api/v1/components/:id/rate           // { rating: 1-5, comment?: string }
```

### Search Request/Response

```typescript
interface SearchRequest {
  q: string;
  tags?: string[];
  category?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  limit?: number;          // Default: 10, max: 50
  offset?: number;
  minRating?: number;
  sortBy?: 'relevance' | 'rating' | 'downloads' | 'recent';
}

interface SearchResponse {
  results: {
    id: string;
    name: string;
    summary: string;
    description: string;
    tags: string[];
    category: string;
    complexity: string;
    rating: number;
    downloadCount: number;
    relevanceScore: number;
    manifest: ComponentManifest;
  }[];
  total: number;
  offset: number;
  limit: number;
}
```

### Component Upload (Community)

```
POST /api/v1/components/upload
Body: { manifest: ComponentManifest, files: Record<string, string> }
Response: 202 { uploadId: string, status: "pending_review" }

GET  /api/v1/components/upload/:id/status   // Poll
GET  /api/v1/components/upload/:id/stream   // SSE (Day 1)
```

Same-name uploads by same author create new versions.

### SSE Review Stream

```
GET /api/v1/components/upload/:id/stream
Content-Type: text/event-stream

data: { "stage": "manifest_validation", "status": "in_progress" }
data: { "stage": "manifest_validation", "status": "complete", "result": "passed" }
data: { "stage": "security_scan", "status": "in_progress", "progress": 0.3 }
...
data: { "stage": "complete", "status": "approved", "componentId": "uuid" }
```

### 7 Review Stages

```typescript
type ReviewStage =
  | 'manifest_validation'
  | 'security_scan'
  | 'dependency_check'
  | 'quality_review'
  | 'test_render'
  | 'cataloging'
  | 'embedding';
```

**Quality review — Tailwind token enforcement:** Components using raw color utilities (`bg-blue-500`, `text-gray-900`) instead of semantic tokens (`bg-primary`, `text-muted`) are **hard rejected**. Rejection message: `STYLING_TOKEN_VIOLATION`. Client receives this and can regenerate.

### Checkpoint Backup (Private)

```
POST   /api/v1/checkpoints
       Body: { projectId, componentLocalId, componentName, version, files: Record<string, string>, manifest, description, trigger }
GET    /api/v1/checkpoints/:componentLocalId?projectId={pid}
GET    /api/v1/checkpoints/:componentLocalId/:version?projectId={pid}
DELETE /api/v1/checkpoints/:componentLocalId/:version?projectId={pid}
```

### Component Revocation

When the server determines a component must be removed (security issue, abuse report, legal):

```
POST /api/v1/components/:id/revoke        // Server-initiated, marks component as revoked
```

Revocation is included in the `check-updates` response:

```typescript
interface CheckUpdatesResponse {
  updates: {
    id: string;
    currentVersion: string;
    latestVersion: string;
    changelog?: string;
  }[];
  revocations: {
    id: string;                        // Component to remove
    reason: 'security' | 'abuse' | 'legal' | 'author-request';
    message?: string;                  // Human-readable message shown to user
  }[];
}
```

**Client behavior on revocation:**
- Show notification: "Component [name] has been removed from CSlate community. [Learn More]"
- Component remains functional locally (does not auto-delete from user's project)
- Component is removed from search results and blueprint recommendations
- Cloud checkpoint backups are retained (user's private data)
- User can choose to keep using locally or delete — it's their choice

### User

```
GET   /api/v1/users/me
GET   /api/v1/users/me/components
GET   /api/v1/users/me/checkpoints
PATCH /api/v1/users/me
```

---

## Error Handling

```typescript
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  statusCode: number;
}
```

| Code | HTTP | Description |
|---|---|---|
| AUTH_REQUIRED | 401 | Missing or invalid API key |
| FORBIDDEN | 403 | Not authorized |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request |
| MANIFEST_INVALID | 400 | Manifest schema failure |
| UPLOAD_TOO_LARGE | 413 | Exceeds size limits |
| REVIEW_REJECTED | 422 | Failed review (includes reasons) |
| RATE_LIMITED | 429 | Too many requests |
| SERVER_ERROR | 500 | Internal error |

---

## Rate Limiting

| Endpoint | Rate Limit |
|---|---|
| Search | 100 req/min |
| Retrieval | 120 req/min |
| Upload | 10 req/hour |
| Checkpoint upload | 60 req/hour |
| Checkpoint retrieval | 120 req/min |

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1711612800
```

---

## Shared Package: @cslate/shared

Both client and server import from:

```
@cslate/shared
├── schemas/
│   ├── manifest.ts       // Zod schema for ComponentManifest
│   ├── checkpoint.ts     // Zod schema for checkpoints
│   └── api.ts            // Zod schemas for API request/response
├── types/
│   └── index.ts          // TypeScript types derived from Zod schemas
└── package.json
```
