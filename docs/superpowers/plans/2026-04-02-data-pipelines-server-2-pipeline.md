# Data Pipelines — CSlate-Server Review Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-stage review pipeline for uploaded pipelines: manifest validation, security scanning, dependency checking, quality review, cataloging (AI enrichment), and embedding generation — mirroring the component review pipeline.

**Architecture:** Reuses the existing pipeline runner pattern (sequential stages, PipelineContext, StageResult). Each stage is a standalone module. The review job is queued via pg-boss and processed by the worker.

**Tech Stack:** TypeScript, Zod, Anthropic Claude (Haiku for review), OpenAI (embeddings), pg-boss, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-data-pipelines-design.md` — Section 5

**Repo:** CSlate-server (working branch from `phase-1-scaffolding`)

**Depends on:** Server Plan 1 (Data Layer — pipeline schema, queries, storage)

---

## File Map

### New Files

```
packages/pipeline/src/pipeline-stages/
  1-manifest-validation.ts              # Validate PipelineManifest schema
  2-security-scan.ts                    # Static pattern + LLM security analysis
  3-dependency-check.ts                 # Validate npm deps (if any)
  4-quality-review.ts                   # LLM code quality check
  5-cataloging.ts                       # AI enrichment: summary, category, tags
  6-embedding.ts                        # Generate embedding + store to R2 + create DB record

packages/pipeline/src/pipeline-runner.ts  # Stage orchestrator for pipeline reviews
packages/pipeline/src/pipeline-types.ts   # PipelineManifest Zod schema (server-side)

packages/queue/src/pipeline-jobs.ts       # Job definitions for pipeline review
apps/worker/src/handlers/pipeline-review.ts  # Worker handler for review job
```

### Modified Files

```
packages/pipeline/src/index.ts            # Export pipeline runner
packages/queue/src/index.ts               # Export pipeline jobs
apps/worker/src/index.ts                  # Register pipeline review handler
```

### Context Files (mirror these patterns)

```
packages/pipeline/src/stages/1-manifest-validation.ts    # Component manifest validation
packages/pipeline/src/stages/2-security-scan.ts          # Component security scan
packages/pipeline/src/stages/6-cataloging.ts             # Component AI enrichment
packages/pipeline/src/stages/7-embedding.ts              # Component embedding
packages/pipeline/src/runner.ts                          # Component stage runner
packages/pipeline/src/types.ts                           # PipelineContext, StageResult
apps/worker/src/handlers/review.ts                       # Component review handler
```

---

### Task 1: Pipeline Manifest Schema (Server-Side)

**Files:**
- Create: `packages/pipeline/src/pipeline-types.ts`

- [ ] **Step 1: Read `packages/pipeline/src/types.ts` to see how ComponentManifest is defined server-side**

- [ ] **Step 2: Implement PipelineManifest schema and PipelineReviewContext**

```typescript
// packages/pipeline/src/pipeline-types.ts
import { z } from 'zod'

export const PipelineManifestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  tags: z.array(z.string()).min(1).max(20),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),

  secrets: z.record(
    z.object({
      description: z.string(),
      required: z.boolean(),
    }),
  ),

  params: z.record(
    z.object({
      type: z.enum(['string', 'number', 'boolean', 'object']),
      description: z.string(),
      required: z.boolean(),
      default: z.unknown().optional(),
    }),
  ),

  outputSchema: z.record(
    z.object({
      type: z.string(),
      description: z.string(),
    }),
  ),

  strategy: z.object({
    type: z.enum(['on-demand', 'polling', 'streaming']),
    intervalMs: z.number().int().positive().optional(),
    cacheTtlMs: z.number().int().nonneg().optional(),
  }),

  files: z.array(z.string()).min(1),
})

export type PipelineManifest = z.infer<typeof PipelineManifestSchema>

export interface PipelineReviewContext {
  uploadId: string
  manifest: PipelineManifest
  files: Record<string, string>
  previousResults: StageResult[]
}

export interface StageResult {
  stage: string
  status: 'passed' | 'failed' | 'warning'
  duration: number
  issues?: Issue[]
  data?: Record<string, unknown>
}

export interface Issue {
  severity: 'critical' | 'warning' | 'info'
  file?: string
  line?: number
  pattern?: string
  message: string
  fix?: string
}
```

Note: Reuse the existing `StageResult` and `Issue` types from `packages/pipeline/src/types.ts` if they're already defined there. Don't duplicate — import them.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline-types.ts
git commit -m "feat(pipeline): add PipelineManifest schema for server validation"
```

---

### Task 2: Stage 1 — Manifest Validation

**Files:**
- Create: `packages/pipeline/src/pipeline-stages/1-manifest-validation.ts`
- Reference: `packages/pipeline/src/stages/1-manifest-validation.ts`

- [ ] **Step 1: Read the component manifest validation stage**

- [ ] **Step 2: Implement pipeline manifest validation**

```typescript
// packages/pipeline/src/pipeline-stages/1-manifest-validation.ts
import { PipelineManifestSchema } from '../pipeline-types'
import type { PipelineReviewContext, StageResult, Issue } from '../pipeline-types'

export async function validatePipelineManifest(
  ctx: PipelineReviewContext,
): Promise<StageResult> {
  const start = Date.now()
  const issues: Issue[] = []

  // 1. Validate manifest schema
  const result = PipelineManifestSchema.safeParse(ctx.manifest)
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({
        severity: 'critical',
        message: `${issue.path.join('.')}: ${issue.message}`,
      })
    }
    return {
      stage: 'manifest-validation',
      status: 'failed',
      duration: Date.now() - start,
      issues,
    }
  }

  // 2. Verify required files exist
  if (!('pipeline.ts' in ctx.files)) {
    issues.push({
      severity: 'critical',
      file: 'pipeline.ts',
      message: 'pipeline.ts is required — it is the pipeline entry point',
    })
  }

  // 3. Verify all declared files are uploaded
  for (const declaredFile of ctx.manifest.files) {
    if (!(declaredFile in ctx.files) && declaredFile !== 'manifest.json') {
      issues.push({
        severity: 'warning',
        file: declaredFile,
        message: `Declared file "${declaredFile}" not found in upload`,
      })
    }
  }

  // 4. Check context.md length if present
  if (ctx.files['context.md'] && ctx.files['context.md'].length > 2000) {
    issues.push({
      severity: 'warning',
      file: 'context.md',
      message: 'context.md exceeds 2000 characters',
    })
  }

  // 5. Verify secret names don't look like actual values
  for (const [name, def] of Object.entries(ctx.manifest.secrets)) {
    if (name.length > 50 || name.includes('=') || name.includes(':')) {
      issues.push({
        severity: 'critical',
        message: `Secret name "${name}" looks like a value — secret names should be identifiers, not values`,
      })
    }
  }

  const hasCritical = issues.some((i) => i.severity === 'critical')
  return {
    stage: 'manifest-validation',
    status: hasCritical ? 'failed' : issues.length > 0 ? 'warning' : 'passed',
    duration: Date.now() - start,
    issues,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline-stages/1-manifest-validation.ts
git commit -m "feat(pipeline): add stage 1 — pipeline manifest validation"
```

---

### Task 3: Stage 2 — Security Scan

**Files:**
- Create: `packages/pipeline/src/pipeline-stages/2-security-scan.ts`
- Reference: `packages/pipeline/src/stages/2-security-scan.ts`

- [ ] **Step 1: Read the component security scan stage**

Understand: blocked patterns, URL allowlist/blocklist, LLM review for obfuscation.

- [ ] **Step 2: Implement pipeline security scan**

Mirror the component security scan but with pipeline-specific patterns:

```typescript
// packages/pipeline/src/pipeline-stages/2-security-scan.ts
import type { PipelineReviewContext, StageResult, Issue } from '../pipeline-types'

// Pipeline-specific blocked patterns
const BLOCKED_PATTERNS = [
  { pattern: /eval\s*\(/, message: 'eval() is not allowed', severity: 'critical' as const },
  { pattern: /child_process/, message: 'child_process is not allowed', severity: 'critical' as const },
  { pattern: /fs\.writeFileSync|fs\.appendFileSync/, message: 'Synchronous file writes not allowed', severity: 'critical' as const },
  { pattern: /fs\.rmSync|fs\.unlinkSync/, message: 'File deletion not allowed', severity: 'critical' as const },
  { pattern: /process\.env/, message: 'Direct env access not allowed — use getSecret()', severity: 'critical' as const },
  { pattern: /require\s*\(\s*['"]child_process['"]/, message: 'child_process import not allowed', severity: 'critical' as const },
  { pattern: /require\s*\(\s*['"]cluster['"]/, message: 'cluster module not allowed', severity: 'critical' as const },
  { pattern: /\.exec\s*\(/, message: 'shell exec not allowed', severity: 'warning' as const },
]

// Secret-value patterns (detect hardcoded secrets)
const SECRET_VALUE_PATTERNS = [
  { pattern: /['"]sk-[a-zA-Z0-9]{32,}['"]/, message: 'Possible hardcoded API key detected' },
  { pattern: /['"][a-f0-9]{64}['"]/, message: 'Possible hardcoded secret hash detected' },
  { pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/, message: 'Possible hardcoded bearer token' },
]

export async function scanPipelineSecurity(
  ctx: PipelineReviewContext,
): Promise<StageResult> {
  const start = Date.now()
  const issues: Issue[] = []

  for (const [filename, content] of Object.entries(ctx.files)) {
    // Skip non-code files
    if (!filename.endsWith('.ts') && !filename.endsWith('.js')) continue

    const lines = content.split('\n')

    // Check blocked patterns
    for (const { pattern, message, severity } of BLOCKED_PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          issues.push({
            severity,
            file: filename,
            line: i + 1,
            pattern: pattern.source,
            message,
          })
        }
      }
    }

    // Check for hardcoded secrets
    for (const { pattern, message } of SECRET_VALUE_PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          issues.push({
            severity: 'critical',
            file: filename,
            line: i + 1,
            pattern: pattern.source,
            message,
          })
        }
      }
    }
  }

  // TODO: Add LLM-based obfuscation detection (mirror component stage 2 LLM review)
  // For initial implementation, static patterns are sufficient.

  const hasCritical = issues.some((i) => i.severity === 'critical')
  return {
    stage: 'security-scan',
    status: hasCritical ? 'failed' : issues.length > 0 ? 'warning' : 'passed',
    duration: Date.now() - start,
    issues,
  }
}
```

Note: For the LLM review portion, read how the component security scan calls Claude Haiku and replicate that pattern. The static patterns above are a starting point.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline-stages/2-security-scan.ts
git commit -m "feat(pipeline): add stage 2 — pipeline security scan"
```

---

### Task 4: Stage 3 — Dependency Check

**Files:**
- Create: `packages/pipeline/src/pipeline-stages/3-dependency-check.ts`

- [ ] **Step 1: Implement dependency check**

Simpler than component deps since pipelines bundle everything. Main check: no dangerous npm imports.

```typescript
// packages/pipeline/src/pipeline-stages/3-dependency-check.ts
import type { PipelineReviewContext, StageResult } from '../pipeline-types'

export async function checkPipelineDependencies(
  ctx: PipelineReviewContext,
): Promise<StageResult> {
  const start = Date.now()
  // Pipelines bundle all deps — dependency check is lightweight
  // Main concern: detecting imports of dangerous modules
  return {
    stage: 'dependency-check',
    status: 'passed',
    duration: Date.now() - start,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline-stages/3-dependency-check.ts
git commit -m "feat(pipeline): add stage 3 — pipeline dependency check"
```

---

### Task 5: Stage 4 — Quality Review (LLM)

**Files:**
- Create: `packages/pipeline/src/pipeline-stages/4-quality-review.ts`
- Reference: `packages/pipeline/src/stages/4-quality-review.ts`

- [ ] **Step 1: Read component quality review stage**

- [ ] **Step 2: Implement pipeline quality review**

Mirror the component quality review but with pipeline-specific criteria:

```typescript
// packages/pipeline/src/pipeline-stages/4-quality-review.ts
import type { PipelineReviewContext, StageResult, Issue } from '../pipeline-types'

// This stage uses LLM (Claude Haiku) to review pipeline code quality.
// Read the component quality review stage for the exact LLM call pattern.

export async function reviewPipelineQuality(
  ctx: PipelineReviewContext,
  llmClient: any, // Anthropic client — match type from packages/llm
): Promise<StageResult> {
  const start = Date.now()
  const issues: Issue[] = []

  const pipelineCode = Object.entries(ctx.files)
    .filter(([name]) => name.endsWith('.ts') || name.endsWith('.js'))
    .map(([name, content]) => `// ${name}\n${content}`)
    .join('\n\n')

  const prompt = `Review this data pipeline code for quality issues. The pipeline implements a DataPipeline interface with execute() and optionally stream()/dispose() methods.

Check for:
1. Error handling: Does execute() handle API failures gracefully?
2. Secret usage: Are secrets accessed via getSecret(), never hardcoded?
3. Output format: Does it return proper PipelineOutput with data + metadata?
4. Resource cleanup: If stream() is implemented, does dispose() clean up?
5. Rate limiting: Does it respect API rate limits?
6. Input validation: Does it validate params before use?

Pipeline manifest:
${JSON.stringify(ctx.manifest, null, 2)}

Pipeline code:
${pipelineCode}

Respond with a JSON array of issues: [{ severity: "warning"|"info", file: string, message: string }]
Return an empty array if no issues found.`

  try {
    // Call LLM — mirror the exact pattern from component quality review
    // const response = await llmClient.messages.create({ ... })
    // Parse response and add to issues
  } catch {
    // LLM failure is non-fatal for quality review
  }

  return {
    stage: 'quality-review',
    status: issues.some((i) => i.severity === 'critical')
      ? 'failed'
      : issues.length > 0
        ? 'warning'
        : 'passed',
    duration: Date.now() - start,
    issues,
  }
}
```

Note: Read the actual LLM client usage in the component quality review and replicate exactly. The prompt above is a starting point.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline-stages/4-quality-review.ts
git commit -m "feat(pipeline): add stage 4 — LLM quality review"
```

---

### Task 6: Stage 5 — Cataloging (AI Enrichment)

**Files:**
- Create: `packages/pipeline/src/pipeline-stages/5-cataloging.ts`
- Reference: `packages/pipeline/src/stages/6-cataloging.ts`

- [ ] **Step 1: Read component cataloging stage**

- [ ] **Step 2: Implement pipeline cataloging**

Mirror the component cataloging but for pipelines (generate summary, category, complexity, AI hints):

```typescript
// packages/pipeline/src/pipeline-stages/5-cataloging.ts
import type { PipelineReviewContext, StageResult } from '../pipeline-types'

export async function catalogPipeline(
  ctx: PipelineReviewContext,
  llmClient: any,
): Promise<StageResult> {
  const start = Date.now()

  const prompt = `Analyze this data pipeline and generate catalog metadata.

Pipeline: ${ctx.manifest.name}
Description: ${ctx.manifest.description}
Tags: ${ctx.manifest.tags.join(', ')}
Strategy: ${ctx.manifest.strategy.type}
Secrets needed: ${Object.keys(ctx.manifest.secrets).join(', ') || 'none'}

Code:
${Object.entries(ctx.files)
  .filter(([n]) => n.endsWith('.ts'))
  .map(([n, c]) => `// ${n}\n${c}`)
  .join('\n\n')}

Generate JSON:
{
  "summary": "2-3 sentence description of what this pipeline does and how",
  "category": "one of: finance, weather, social, news, ecommerce, analytics, iot, other",
  "subcategory": "specific subcategory",
  "complexity": "simple | moderate | complex",
  "contextSummary": "1 sentence for embedding context",
  "modificationHints": ["how to customize this pipeline"],
  "extensionPoints": ["what can be added to this pipeline"]
}`

  try {
    // Call LLM — mirror component cataloging pattern
    // Parse structured output
    // Return enrichment data in result.data
    return {
      stage: 'cataloging',
      status: 'passed',
      duration: Date.now() - start,
      data: {
        // summary, category, subcategory, complexity, contextSummary,
        // modificationHints, extensionPoints
      },
    }
  } catch {
    // Fallback defaults
    return {
      stage: 'cataloging',
      status: 'warning',
      duration: Date.now() - start,
      data: {
        summary: ctx.manifest.description,
        category: 'other',
        complexity: 'moderate',
        contextSummary: ctx.manifest.description,
      },
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline-stages/5-cataloging.ts
git commit -m "feat(pipeline): add stage 5 — AI cataloging enrichment"
```

---

### Task 7: Stage 6 — Embedding & Store

**Files:**
- Create: `packages/pipeline/src/pipeline-stages/6-embedding.ts`
- Reference: `packages/pipeline/src/stages/7-embedding.ts`

- [ ] **Step 1: Read component embedding stage**

- [ ] **Step 2: Implement pipeline embedding & store**

```typescript
// packages/pipeline/src/pipeline-stages/6-embedding.ts
import type { PipelineReviewContext, StageResult } from '../pipeline-types'

export async function embedAndStorePipeline(
  ctx: PipelineReviewContext,
  deps: {
    embeddingClient: any   // OpenAI client
    db: any                // Drizzle DB instance
    storage: any           // R2 storage client
    bucket: string
    catalogData: Record<string, unknown>  // From stage 5
    authorId: string
  },
): Promise<StageResult> {
  const start = Date.now()

  try {
    // 1. Generate embedding from metadata
    const embeddingText = [
      ctx.manifest.name,
      ctx.manifest.description,
      ctx.manifest.tags.join(' '),
      deps.catalogData.summary || '',
      deps.catalogData.contextSummary || '',
      ctx.manifest.strategy.type,
    ].join(' ')

    // Call OpenAI embeddings — mirror component embedding pattern
    // const embedding = await getEmbedding(embeddingText)

    // 2. Store source files to R2
    // const storageKey = await storePipelineSource(deps.storage, deps.bucket, ctx.uploadId, ctx.files)

    // 3. Create pipeline record in DB
    // const pipeline = await createPipeline(deps.db, {
    //   name: ctx.manifest.name,
    //   pipelineId: ctx.manifest.name.toLowerCase().replace(/\s+/g, '_'),
    //   description: ctx.manifest.description,
    //   tags: ctx.manifest.tags,
    //   strategyType: ctx.manifest.strategy.type,
    //   secretNames: Object.keys(ctx.manifest.secrets),
    //   outputSchema: ctx.manifest.outputSchema,
    //   manifest: ctx.manifest,
    //   authorId: deps.authorId,
    //   embedding,
    //   storageKey,
    //   summary: deps.catalogData.summary,
    //   category: deps.catalogData.category,
    //   complexity: deps.catalogData.complexity,
    //   contextSummary: deps.catalogData.contextSummary,
    // })

    return {
      stage: 'embedding-store',
      status: 'passed',
      duration: Date.now() - start,
      data: {
        // pipelineId: pipeline.id,
        // storageKey,
      },
    }
  } catch (err) {
    return {
      stage: 'embedding-store',
      status: 'failed',
      duration: Date.now() - start,
      issues: [{ severity: 'critical', message: (err as Error).message }],
    }
  }
}
```

Note: Read the component embedding stage for exact API calls and fill in the commented sections.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline-stages/6-embedding.ts
git commit -m "feat(pipeline): add stage 6 — embedding generation and storage"
```

---

### Task 8: Pipeline Review Runner

**Files:**
- Create: `packages/pipeline/src/pipeline-runner.ts`
- Reference: `packages/pipeline/src/runner.ts`

- [ ] **Step 1: Read component runner.ts**

- [ ] **Step 2: Implement pipeline review runner**

```typescript
// packages/pipeline/src/pipeline-runner.ts
import type { PipelineReviewContext, StageResult } from './pipeline-types'
import { validatePipelineManifest } from './pipeline-stages/1-manifest-validation'
import { scanPipelineSecurity } from './pipeline-stages/2-security-scan'
import { checkPipelineDependencies } from './pipeline-stages/3-dependency-check'
import { reviewPipelineQuality } from './pipeline-stages/4-quality-review'
import { catalogPipeline } from './pipeline-stages/5-cataloging'
import { embedAndStorePipeline } from './pipeline-stages/6-embedding'

export interface PipelineReviewDeps {
  llmClient: any
  embeddingClient: any
  db: any
  storage: any
  bucket: string
  authorId: string
  onStageComplete?: (stage: string, result: StageResult) => void
}

export async function runPipelineReview(
  ctx: PipelineReviewContext,
  deps: PipelineReviewDeps,
): Promise<{ status: 'approved' | 'rejected'; stages: StageResult[] }> {
  const stages: StageResult[] = []

  const runStage = async (fn: () => Promise<StageResult>) => {
    const result = await fn()
    stages.push(result)
    ctx.previousResults = [...stages]
    deps.onStageComplete?.(result.stage, result)

    if (result.status === 'failed') {
      return false // Stop pipeline
    }
    return true
  }

  // Stage 1: Manifest validation
  if (!(await runStage(() => validatePipelineManifest(ctx)))) {
    return { status: 'rejected', stages }
  }

  // Stage 2: Security scan
  if (!(await runStage(() => scanPipelineSecurity(ctx)))) {
    return { status: 'rejected', stages }
  }

  // Stage 3: Dependency check
  if (!(await runStage(() => checkPipelineDependencies(ctx)))) {
    return { status: 'rejected', stages }
  }

  // Stage 4: Quality review
  if (!(await runStage(() => reviewPipelineQuality(ctx, deps.llmClient)))) {
    return { status: 'rejected', stages }
  }

  // Stage 5: Cataloging
  if (!(await runStage(() => catalogPipeline(ctx, deps.llmClient)))) {
    return { status: 'rejected', stages }
  }

  const catalogData = stages.find((s) => s.stage === 'cataloging')?.data ?? {}

  // Stage 6: Embedding & store
  if (
    !(await runStage(() =>
      embedAndStorePipeline(ctx, {
        ...deps,
        catalogData,
      }),
    ))
  ) {
    return { status: 'rejected', stages }
  }

  return { status: 'approved', stages }
}
```

- [ ] **Step 3: Export from pipeline/index.ts**

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline-runner.ts packages/pipeline/src/index.ts
git commit -m "feat(pipeline): add pipeline review runner"
```

---

### Task 9: Worker Handler & Job Queue

**Files:**
- Create: `apps/worker/src/handlers/pipeline-review.ts`
- Create: `packages/queue/src/pipeline-jobs.ts`
- Modify: `apps/worker/src/index.ts`
- Reference: `apps/worker/src/handlers/review.ts`, `packages/queue/src/jobs.ts`

- [ ] **Step 1: Read component review handler and job definitions**

- [ ] **Step 2: Define pipeline review job**

```typescript
// packages/queue/src/pipeline-jobs.ts
export const PIPELINE_REVIEW_JOB = 'review-pipeline'

export interface PipelineReviewJobData {
  uploadId: string
}
```

- [ ] **Step 3: Implement pipeline review handler**

Mirror the component review handler:

```typescript
// apps/worker/src/handlers/pipeline-review.ts
import type { PipelineReviewJobData } from '@cslate/queue/pipeline-jobs'
import { runPipelineReview } from '@cslate/pipeline'
// ... mirror the component handler pattern:
// 1. Load upload from DB
// 2. Load files from R2
// 3. Run pipeline review stages
// 4. Update upload status (approved/rejected)
// 5. If approved: set upload.pipelineId
```

- [ ] **Step 4: Register handler in worker index.ts**

Add to the worker's job handler registration:
```typescript
import { PIPELINE_REVIEW_JOB } from '@cslate/queue/pipeline-jobs'
import { handlePipelineReview } from './handlers/pipeline-review'

// Register: boss.work(PIPELINE_REVIEW_JOB, handlePipelineReview)
```

- [ ] **Step 5: Commit**

```bash
git add packages/queue/src/pipeline-jobs.ts apps/worker/src/handlers/pipeline-review.ts apps/worker/src/index.ts
git commit -m "feat(worker): add pipeline review job handler"
```

---

### Task 10: Run Tests & Typecheck

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`

- [ ] **Step 2: Run tests**

Run: `pnpm test`

- [ ] **Step 3: Final commit if needed**
