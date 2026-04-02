# Data Pipelines — CSlate-Server API Routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HTTP API endpoints for pipeline search, upload, source retrieval, metadata, and combined search — completing the server-side pipeline catalog.

**Architecture:** Hono routes mirroring the existing component routes. Rate-limited, authenticated where needed. Upload triggers async review job via pg-boss.

**Tech Stack:** Hono, Zod, pg-boss, Drizzle, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-data-pipelines-design.md` — Section 5

**Repo:** CSlate-server (working branch from `phase-1-scaffolding`)

**Depends on:** Server Plan 1 (Data Layer) + Server Plan 2 (Review Pipeline)

---

## File Map

### New Files

```
apps/api/src/routes/pipelines.ts            # Pipeline CRUD + search routes
apps/api/src/routes/pipeline-uploads.ts      # Pipeline upload + status routes
apps/api/src/routes/search.ts               # Combined search endpoint (components + pipelines)
```

### Modified Files

```
apps/api/src/index.ts                       # Mount pipeline routes
```

### Context Files (mirror these patterns)

```
apps/api/src/routes/components.ts           # Component routes (mirror for pipeline routes)
apps/api/src/routes/uploads.ts              # Component upload routes (mirror for pipeline uploads)
apps/api/src/index.ts                       # Route mounting pattern
apps/api/src/middleware/rate-limit.ts        # Rate limiting middleware
apps/api/src/middleware/auth.ts              # Authentication middleware
```

---

### Task 1: Pipeline Search & Read Routes

**Files:**
- Create: `apps/api/src/routes/pipelines.ts`
- Reference: `apps/api/src/routes/components.ts`

- [ ] **Step 1: Read `apps/api/src/routes/components.ts` thoroughly**

Understand: route structure, Hono patterns, Zod validation, rate limiting, auth middleware, response formats.

- [ ] **Step 2: Implement pipeline routes**

```typescript
// apps/api/src/routes/pipelines.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
// Import DB queries, auth middleware, rate limiting — same as components.ts

const pipelines = new Hono()

// ──────────────────────────────────────────────
// GET /api/v1/pipelines/search
// ──────────────────────────────────────────────
pipelines.get(
  '/search',
  // rate limit middleware — use 'search' group
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      tags: z.string().optional(), // comma-separated
      category: z.string().optional(),
      strategyType: z.enum(['on-demand', 'polling', 'streaming']).optional(),
      minRating: z.coerce.number().min(1).max(5).optional(),
      sortBy: z.enum(['relevance', 'rating', 'downloads', 'recent']).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    }),
  ),
  async (c) => {
    const { q, tags, category, strategyType, minRating, sortBy, limit = 20, offset = 0 } =
      c.req.valid('query')

    // 1. Generate embedding from query
    // const embedding = await getEmbedding(q)

    // 2. Search pipelines
    // const { results, total } = await searchPipelines(db, {
    //   embedding,
    //   tags: tags?.split(','),
    //   category,
    //   strategyType,
    //   minRating,
    //   sortBy,
    //   limit,
    //   offset,
    // })

    // 3. Format response (strip embeddings from results)
    return c.json({
      results: [], // Map results to response format
      total: 0,
      offset,
      limit,
    })
  },
)

// ──────────────────────────────────────────────
// GET /api/v1/pipelines/:id
// ──────────────────────────────────────────────
pipelines.get(
  '/:id',
  // rate limit middleware
  async (c) => {
    const id = c.req.param('id')
    // const pipeline = await getPipelineById(db, id)
    // if (!pipeline) return c.json({ error: 'Pipeline not found' }, 404)
    // return c.json(pipeline)
    return c.json({ error: 'Not implemented' }, 501)
  },
)

// ──────────────────────────────────────────────
// GET /api/v1/pipelines/:id/source
// ──────────────────────────────────────────────
pipelines.get(
  '/:id/source',
  // rate limit middleware
  async (c) => {
    const id = c.req.param('id')

    // 1. Get pipeline from DB
    // const pipeline = await getPipelineById(db, id)
    // if (!pipeline) return c.json({ error: 'Pipeline not found' }, 404)

    // 2. Fetch source files from R2
    // const files = await fetchPipelineSource(storage, bucket, pipeline.storageKey)

    // 3. Increment download count
    // await incrementDownloadCount(db, id)

    // 4. Return source
    return c.json({
      id,
      manifest: {}, // pipeline.manifest,
      files: {},     // files,
      summary: '',   // pipeline.summary,
      version: '',   // pipeline.version,
      updatedAt: '', // pipeline.updatedAt,
    })
  },
)

// ──────────────────────────────────────────────
// GET /api/v1/pipelines/:id/versions
// ──────────────────────────────────────────────
pipelines.get(
  '/:id/versions',
  // rate limit middleware
  async (c) => {
    const id = c.req.param('id')
    // Walk parent_id chain — same pattern as components
    return c.json({ versions: [] })
  },
)

// ──────────────────────────────────────────────
// POST /api/v1/pipelines/:id/rate (authenticated)
// ──────────────────────────────────────────────
pipelines.post(
  '/:id/rate',
  // auth middleware
  zValidator('json', z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  })),
  async (c) => {
    // Mirror component rating logic
    return c.json({ rating: 0, ratingCount: 0 })
  },
)

// ──────────────────────────────────────────────
// POST /api/v1/pipelines/:id/report (authenticated)
// ──────────────────────────────────────────────
pipelines.post(
  '/:id/report',
  // auth middleware
  zValidator('json', z.object({
    reason: z.enum(['malicious', 'broken', 'inappropriate', 'copyright', 'other']),
    description: z.string().max(1000).optional(),
  })),
  async (c) => {
    // Mirror component report logic
    return c.json({ reportId: '' }, 201)
  },
)

export default pipelines
```

Note: This is a scaffold. Fill in the actual DB calls, embedding generation, storage access, and rate limiting by reading how `components.ts` does it. The patterns should be identical — just operating on `pipelines` table instead of `components`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/pipelines.ts
git commit -m "feat(api): add pipeline search and CRUD routes"
```

---

### Task 2: Pipeline Upload Routes

**Files:**
- Create: `apps/api/src/routes/pipeline-uploads.ts`
- Reference: `apps/api/src/routes/uploads.ts`

- [ ] **Step 1: Read component upload routes**

- [ ] **Step 2: Implement pipeline upload routes**

```typescript
// apps/api/src/routes/pipeline-uploads.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { PipelineManifestSchema } from '@cslate/pipeline/pipeline-types'
// Import auth middleware, queue client, storage, DB

const pipelineUploads = new Hono()

// ──────────────────────────────────────────────
// POST /api/v1/pipelines/upload (authenticated)
// ──────────────────────────────────────────────
pipelineUploads.post(
  '/',
  // auth middleware
  zValidator(
    'json',
    z.object({
      manifest: PipelineManifestSchema,
      files: z.record(z.string()),
    }),
  ),
  async (c) => {
    const { manifest, files } = c.req.valid('json')
    const userId = c.get('userId') // From auth middleware

    // 1. Validate pipeline.ts exists
    if (!('pipeline.ts' in files)) {
      return c.json({ error: 'pipeline.ts is required' }, 400)
    }

    // 2. Check size limit (2MB)
    const totalSize = Object.values(files).reduce((sum, f) => sum + f.length, 0)
    if (totalSize > 2 * 1024 * 1024) {
      return c.json({ error: 'Upload exceeds 2MB size limit' }, 400)
    }

    // 3. Store files to R2
    // const storageKey = await storePipelineSource(storage, bucket, uploadId, files)

    // 4. Create upload record
    // const upload = await createPipelineUpload(db, {
    //   authorId: userId,
    //   manifest,
    //   storageKey,
    //   status: 'pending',
    // })

    // 5. Queue review job
    // await boss.send(PIPELINE_REVIEW_JOB, { uploadId: upload.id })

    return c.json({ uploadId: '', status: 'pending' }, 202)
  },
)

// ──────────────────────────────────────────────
// GET /api/v1/pipelines/upload/:id/status (authenticated)
// ──────────────────────────────────────────────
pipelineUploads.get(
  '/:id/status',
  // auth middleware
  async (c) => {
    const uploadId = c.req.param('id')
    // const upload = await getPipelineUpload(db, uploadId)
    // if (!upload) return c.json({ error: 'Upload not found' }, 404)
    return c.json({
      uploadId,
      status: 'pending',
      currentStage: null,
      completedStages: [],
      rejectionReasons: null,
      pipelineId: null,
    })
  },
)

// ──────────────────────────────────────────────
// GET /api/v1/pipelines/upload/:id/stream (authenticated, SSE)
// ──────────────────────────────────────────────
pipelineUploads.get(
  '/:id/stream',
  // auth middleware
  async (c) => {
    // Mirror component upload SSE streaming pattern
    // Set headers for SSE, poll upload status, send events
    return c.text('SSE not yet implemented', 501)
  },
)

export default pipelineUploads
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/pipeline-uploads.ts
git commit -m "feat(api): add pipeline upload routes"
```

---

### Task 3: Combined Search Route

**Files:**
- Create: `apps/api/src/routes/search.ts`

- [ ] **Step 1: Implement combined search**

```typescript
// apps/api/src/routes/search.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const search = new Hono()

// ──────────────────────────────────────────────
// GET /api/v1/search?q=...&type=all|component|pipeline
// ──────────────────────────────────────────────
search.get(
  '/',
  // rate limit middleware
  zValidator(
    'query',
    z.object({
      q: z.string().min(1),
      type: z.enum(['all', 'component', 'pipeline']).optional().default('all'),
      limit: z.coerce.number().int().min(1).max(50).optional().default(10),
    }),
  ),
  async (c) => {
    const { q, type, limit } = c.req.valid('query')

    // 1. Generate embedding once
    // const embedding = await getEmbedding(q)

    // 2. Search based on type
    let components: any[] = []
    let pipelines: any[] = []

    if (type === 'all' || type === 'component') {
      // const componentResults = await searchComponents(db, { embedding, limit })
      // components = componentResults.results
    }

    if (type === 'all' || type === 'pipeline') {
      // const pipelineResults = await searchPipelines(db, { embedding, limit })
      // pipelines = pipelineResults.results
    }

    return c.json({ components, pipelines })
  },
)

export default search
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/search.ts
git commit -m "feat(api): add combined search route"
```

---

### Task 4: Mount Routes in API Server

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Read current index.ts to see route mounting pattern**

- [ ] **Step 2: Mount pipeline routes**

```typescript
import pipelines from './routes/pipelines'
import pipelineUploads from './routes/pipeline-uploads'
import search from './routes/search'

// Mount alongside existing component routes:
app.route('/api/v1/pipelines', pipelines)
app.route('/api/v1/pipelines/upload', pipelineUploads)
app.route('/api/v1/search', search)
```

Note: Check exact mounting pattern. Upload routes may need to be mounted before the `:id` routes to avoid conflicts (same pattern as component uploads).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): mount pipeline routes"
```

---

### Task 5: Update CSlateServerClient (Client-Side)

**Files:**
- Modify: `src/main/server/CSlateServerClient.ts` (in CSlate repo, not server repo)

Note: This task modifies the CSlate **client** repo. If working in the server worktree, flag this as a cross-repo dependency. If working in the CSlate worktree, implement here.

- [ ] **Step 1: Read current CSlateServerClient.ts**

- [ ] **Step 2: Add pipeline methods**

```typescript
// Add to CSlateServerClient class:

async searchPipelines(query: string, limit: number): Promise<{
  results: any[]
  total: number
  error?: string
}> {
  const url = new URL('/api/v1/pipelines/search', this.serverUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${this.apiKey}` },
  })

  if (!response.ok) {
    return { results: [], total: 0, error: `Server returned ${response.status}` }
  }

  return response.json()
}

async publishPipeline(payload: {
  manifest: unknown
  files: Record<string, string>
}): Promise<{ uploadId?: string; status?: string; error?: string }> {
  const response = await fetch(
    new URL('/api/v1/pipelines/upload', this.serverUrl).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    },
  )

  if (!response.ok) {
    return { error: `Server returned ${response.status}` }
  }

  return response.json()
}

async fetchPipelineSource(pipelineId: string): Promise<{
  source?: Record<string, string>
  manifest?: unknown
  error?: string
}> {
  const response = await fetch(
    new URL(`/api/v1/pipelines/${pipelineId}/source`, this.serverUrl).toString(),
    {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    },
  )

  if (!response.ok) {
    return { error: `Server returned ${response.status}` }
  }

  const data = await response.json()
  return { source: data.files, manifest: data.manifest }
}

async searchAll(query: string, limit: number): Promise<{
  components: any[]
  pipelines: any[]
}> {
  const url = new URL('/api/v1/search', this.serverUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit))

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${this.apiKey}` },
  })

  if (!response.ok) {
    return { components: [], pipelines: [] }
  }

  return response.json()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/server/CSlateServerClient.ts
git commit -m "feat(server-client): add pipeline search, publish, fetch methods"
```

---

### Task 6: Run Tests & Typecheck

- [ ] **Step 1: Run server typecheck**

Run: `pnpm run typecheck`

- [ ] **Step 2: Run server tests**

Run: `pnpm test`

- [ ] **Step 3: Final commit if needed**
