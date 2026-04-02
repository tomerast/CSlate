# Data Pipelines — CSlate-Server Data Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pipeline DB schema, migrations, queries, and storage layer to CSlate-server — the foundation for pipeline catalog, search, and persistence.

**Architecture:** Mirrors the existing component data layer: Drizzle ORM schema, pgvector embeddings for semantic search, R2 storage for source files, pg-boss job queue for async processing.

**Tech Stack:** PostgreSQL + pgvector, Drizzle ORM, R2/S3, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-data-pipelines-design.md` — Section 5

**Repo:** CSlate-server (working branch from `phase-1-scaffolding`)

**Depends on:** Nothing (new files, mirrors existing component patterns)

---

## File Map

### New Files

```
packages/db/src/schema/pipelines.ts           # Pipeline DB table definition
packages/db/src/schema/pipeline-uploads.ts     # Pipeline upload staging table
packages/db/src/queries/pipelines.ts           # Pipeline CRUD + search queries
packages/db/drizzle/XXXX_add_pipelines.sql     # Migration SQL
packages/storage/src/pipelines.ts              # R2 storage for pipeline source files
```

### Modified Files

```
packages/db/src/schema/index.ts               # Export pipeline tables
packages/db/src/queries/index.ts              # Export pipeline queries
packages/storage/src/index.ts                 # Export pipeline storage
```

### Context Files (read-only, mirror these patterns)

```
packages/db/src/schema/components.ts          # Component table (mirror for pipelines)
packages/db/src/schema/uploads.ts             # Upload staging table (mirror for pipeline-uploads)
packages/db/src/queries/components.ts         # Component queries (mirror for pipeline queries)
packages/db/drizzle/0000_initial.sql          # Existing migration (see table patterns)
packages/storage/src/components.ts            # Component storage (mirror for pipelines)
```

---

### Task 1: Pipeline DB Schema

**Files:**
- Create: `packages/db/src/schema/pipelines.ts`
- Reference: `packages/db/src/schema/components.ts`

- [ ] **Step 1: Read `packages/db/src/schema/components.ts` to understand exact Drizzle patterns**

Read the full file to understand: column types, index definitions, relation definitions, uuid generation, vector column, etc.

- [ ] **Step 2: Implement pipeline table schema**

```typescript
// packages/db/src/schema/pipelines.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './users'

// Note: vector column requires the pgvector extension import — check how components.ts does it
// and use the same pattern (e.g., customType or drizzle-orm/pg-core vector support)

export const pipelines = pgTable(
  'pipelines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    pipelineId: text('pipeline_id').notNull(), // snake_case ID (e.g., "yahoo_stocks")
    description: text('description').notNull(),
    tags: text('tags').array().notNull().default([]),
    version: text('version').notNull().default('1.0.0'),
    category: text('category'),
    subcategory: text('subcategory'),
    complexity: text('complexity'), // 'simple' | 'moderate' | 'complex'

    // Pipeline-specific fields
    strategyType: text('strategy_type').notNull(), // 'on-demand' | 'polling' | 'streaming'
    secretNames: text('secret_names').array().notNull().default([]), // Secret names (never values)
    outputSchema: jsonb('output_schema'), // JSON Schema of pipeline output

    // AI-generated enrichment
    summary: text('summary'),
    contextSummary: text('context_summary'),

    // Ownership
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Full manifest
    manifest: jsonb('manifest').notNull(),

    // Search
    embedding: /* vector(1536) — use same pattern as components.ts */,

    // Storage
    storageKey: text('storage_key'), // R2 bucket path for source files

    // Metrics
    downloadCount: integer('download_count').notNull().default(0),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),

    // Versioning
    parentId: uuid('parent_id'), // Previous version

    // Moderation
    flagged: boolean('flagged').notNull().default(false),
    revoked: boolean('revoked').notNull().default(false),
    revokeReason: text('revoke_reason'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Indices — mirror component indices
    embeddingIdx: index('idx_pipelines_embedding').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    tagsIdx: index('idx_pipelines_tags').using('gin', table.tags),
    categoryIdx: index('idx_pipelines_category').on(table.category),
    authorIdx: index('idx_pipelines_author').on(table.authorId),
    nameAuthorIdx: index('idx_pipelines_name_author').on(table.name, table.authorId),
    downloadIdx: index('idx_pipelines_download').on(table.downloadCount),
    strategyIdx: index('idx_pipelines_strategy').on(table.strategyType),
  }),
)
```

Note: Adapt the vector column definition to match exactly how `components.ts` defines it. Drizzle's pgvector support may use `customType` or a specific import.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/pipelines.ts
git commit -m "feat(db): add pipelines table schema"
```

---

### Task 2: Pipeline Upload Staging Table

**Files:**
- Create: `packages/db/src/schema/pipeline-uploads.ts`
- Reference: `packages/db/src/schema/uploads.ts`

- [ ] **Step 1: Read `packages/db/src/schema/uploads.ts`**

- [ ] **Step 2: Implement pipeline upload staging table**

Mirror the uploads table exactly but reference `pipelines` instead of `components`:

```typescript
// packages/db/src/schema/pipeline-uploads.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { users } from './users'
import { pipelines } from './pipelines'

export const pipelineUploads = pgTable('pipeline_uploads', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  manifest: jsonb('manifest').notNull(),
  storageKey: text('storage_key'),
  status: text('status').notNull().default('pending'), // pending | in_progress | approved | rejected
  currentStage: text('current_stage'),
  completedStages: jsonb('completed_stages').default([]),
  rejectionReasons: jsonb('rejection_reasons'),
  pipelineId: uuid('pipeline_id').references(() => pipelines.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/pipeline-uploads.ts
git commit -m "feat(db): add pipeline_uploads staging table"
```

---

### Task 3: Export Schemas

**Files:**
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Read current schema/index.ts**

- [ ] **Step 2: Add pipeline exports**

```typescript
export * from './pipelines'
export * from './pipeline-uploads'
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/index.ts
git commit -m "feat(db): export pipeline schemas"
```

---

### Task 4: Migration SQL

**Files:**
- Create: `packages/db/drizzle/XXXX_add_pipelines.sql`

- [ ] **Step 1: Read `packages/db/drizzle/0000_initial.sql` to understand migration style**

- [ ] **Step 2: Write migration**

```sql
-- Migration: Add pipelines and pipeline_uploads tables

CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pipeline_id TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  version TEXT NOT NULL DEFAULT '1.0.0',
  category TEXT,
  subcategory TEXT,
  complexity TEXT,
  strategy_type TEXT NOT NULL,
  secret_names TEXT[] NOT NULL DEFAULT '{}',
  output_schema JSONB,
  summary TEXT,
  context_summary TEXT,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manifest JSONB NOT NULL,
  embedding VECTOR(1536),
  storage_key TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  parent_id UUID,
  flagged BOOLEAN NOT NULL DEFAULT FALSE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoke_reason TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_embedding
  ON pipelines USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_pipelines_tags ON pipelines USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_pipelines_category ON pipelines (category);
CREATE INDEX IF NOT EXISTS idx_pipelines_author ON pipelines (author_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_name_author ON pipelines (name, author_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_download ON pipelines (download_count DESC);
CREATE INDEX IF NOT EXISTS idx_pipelines_strategy ON pipelines (strategy_type);

CREATE TABLE IF NOT EXISTS pipeline_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manifest JSONB NOT NULL,
  storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_stage TEXT,
  completed_stages JSONB DEFAULT '[]',
  rejection_reasons JSONB,
  pipeline_id UUID REFERENCES pipelines(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Note: Check how migrations are numbered in the project (sequential numbers, timestamps, etc.) and name accordingly.

- [ ] **Step 3: Commit**

```bash
git add packages/db/drizzle/
git commit -m "feat(db): add pipelines migration"
```

---

### Task 5: Pipeline Queries

**Files:**
- Create: `packages/db/src/queries/pipelines.ts`
- Reference: `packages/db/src/queries/components.ts`

- [ ] **Step 1: Read `packages/db/src/queries/components.ts` thoroughly**

Understand: search query with embedding, filters, sorting, pagination, CRUD operations.

- [ ] **Step 2: Implement pipeline queries**

```typescript
// packages/db/src/queries/pipelines.ts
import { eq, and, sql, desc, asc } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { pipelines } from '../schema/pipelines'
import { pipelineUploads } from '../schema/pipeline-uploads'

// Mirror the exact query pattern from components.ts
// Key queries to implement:

export interface PipelineSearchParams {
  embedding: number[] // 1536-dim vector from query
  tags?: string[]
  category?: string
  strategyType?: string
  minRating?: number
  sortBy?: 'relevance' | 'rating' | 'downloads' | 'recent'
  limit?: number
  offset?: number
}

export async function searchPipelines(
  db: PgDatabase<any>,
  params: PipelineSearchParams,
) {
  const {
    embedding,
    tags,
    category,
    strategyType,
    minRating,
    sortBy = 'relevance',
    limit = 20,
    offset = 0,
  } = params

  // Build WHERE conditions
  const conditions = [
    eq(pipelines.flagged, false),
    eq(pipelines.revoked, false),
  ]

  if (tags?.length) {
    conditions.push(sql`${pipelines.tags} && ${tags}::text[]`)
  }
  if (category) {
    conditions.push(eq(pipelines.category, category))
  }
  if (strategyType) {
    conditions.push(eq(pipelines.strategyType, strategyType))
  }
  if (minRating) {
    conditions.push(
      sql`${pipelines.ratingSum}::float / NULLIF(${pipelines.ratingCount}, 0) >= ${minRating}`,
    )
  }

  // Build ORDER BY
  const embeddingVector = sql`${JSON.stringify(embedding)}::vector`
  const relevanceScore = sql`1 - (${pipelines.embedding} <=> ${embeddingVector})`

  let orderBy
  switch (sortBy) {
    case 'relevance':
      orderBy = desc(relevanceScore)
      break
    case 'rating':
      orderBy = desc(sql`${pipelines.ratingSum}::float / NULLIF(${pipelines.ratingCount}, 0)`)
      break
    case 'downloads':
      orderBy = desc(pipelines.downloadCount)
      break
    case 'recent':
      orderBy = desc(pipelines.createdAt)
      break
  }

  const results = await db
    .select({
      pipeline: pipelines,
      relevanceScore,
    })
    .from(pipelines)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  // Count total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pipelines)
    .where(and(...conditions))

  return { results, total: Number(count) }
}

// CRUD operations
export async function getPipelineById(db: PgDatabase<any>, id: string) {
  const [result] = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.id, id))
    .limit(1)
  return result ?? null
}

export async function createPipeline(
  db: PgDatabase<any>,
  data: typeof pipelines.$inferInsert,
) {
  const [result] = await db.insert(pipelines).values(data).returning()
  return result
}

export async function incrementDownloadCount(db: PgDatabase<any>, id: string) {
  await db
    .update(pipelines)
    .set({
      downloadCount: sql`${pipelines.downloadCount} + 1`,
    })
    .where(eq(pipelines.id, id))
}

// Upload staging
export async function createPipelineUpload(
  db: PgDatabase<any>,
  data: typeof pipelineUploads.$inferInsert,
) {
  const [result] = await db.insert(pipelineUploads).values(data).returning()
  return result
}

export async function getPipelineUpload(db: PgDatabase<any>, id: string) {
  const [result] = await db
    .select()
    .from(pipelineUploads)
    .where(eq(pipelineUploads.id, id))
    .limit(1)
  return result ?? null
}

export async function updatePipelineUpload(
  db: PgDatabase<any>,
  id: string,
  data: Partial<typeof pipelineUploads.$inferInsert>,
) {
  const [result] = await db
    .update(pipelineUploads)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(pipelineUploads.id, id))
    .returning()
  return result
}
```

Note: Adapt the exact Drizzle query patterns, especially the vector search, to match how `components.ts` does it. The SQL patterns above are approximate — the actual pgvector syntax and Drizzle API may differ.

- [ ] **Step 3: Export pipeline queries**

Modify `packages/db/src/queries/index.ts`:
```typescript
export * from './pipelines'
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/queries/pipelines.ts packages/db/src/queries/index.ts
git commit -m "feat(db): add pipeline search and CRUD queries"
```

---

### Task 6: Pipeline Storage (R2)

**Files:**
- Create: `packages/storage/src/pipelines.ts`
- Reference: `packages/storage/src/components.ts`

- [ ] **Step 1: Read `packages/storage/src/components.ts`**

- [ ] **Step 2: Implement pipeline storage**

Mirror the component storage pattern:

```typescript
// packages/storage/src/pipelines.ts
import type { S3Client } from '@aws-sdk/client-s3'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const PIPELINE_PREFIX = 'pipelines'

export async function storePipelineSource(
  s3: S3Client,
  bucket: string,
  pipelineId: string,
  files: Record<string, string>,
): Promise<string> {
  const storageKey = `${PIPELINE_PREFIX}/${pipelineId}/${Date.now()}`

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${storageKey}/source.json`,
      Body: JSON.stringify(files),
      ContentType: 'application/json',
    }),
  )

  return storageKey
}

export async function fetchPipelineSource(
  s3: S3Client,
  bucket: string,
  storageKey: string,
): Promise<Record<string, string>> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: `${storageKey}/source.json`,
    }),
  )

  const body = await response.Body?.transformToString()
  if (!body) throw new Error('Empty source file')
  return JSON.parse(body) as Record<string, string>
}
```

Note: Adapt to match the exact S3 client pattern used in `components.ts`.

- [ ] **Step 3: Export from storage/index.ts**

- [ ] **Step 4: Commit**

```bash
git add packages/storage/src/pipelines.ts packages/storage/src/index.ts
git commit -m "feat(storage): add pipeline R2 storage"
```

---

### Task 7: Run Tests & Typecheck

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck` (or the project's typecheck command)

- [ ] **Step 2: Run existing tests to ensure no regressions**

Run: `pnpm test`

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix(db): address type issues from pipeline data layer"
```
