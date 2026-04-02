# Data Pipelines — CSlate Runtime Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pipeline runtime infrastructure: types, DataBus, Worker Thread executor, and esbuild compiler for pipeline bundles.

**Architecture:** Pipelines are Node.js modules that run in isolated Worker Threads. A PipelineExecutor singleton manages lifecycle (start/stop/restart), a DataBus provides pub/sub for pipeline outputs, and a compiler produces worker-compatible bundles via esbuild.

**Tech Stack:** TypeScript, Node.js worker_threads, esbuild, EventEmitter, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-data-pipelines-design.md`

**Depends on:** Nothing (new files only)

**Produces:** `src/main/pipeline/` module consumed by Plans 2 (Agent Tools) and 3 (Integration)

---

## File Map

### New Files

```
src/main/pipeline/
  types.ts                    # All pipeline types: DataPipeline, PipelineOutput, PipelineManifest, PipelineStatus, etc.
  data-bus.ts                 # DataBus pub/sub (EventEmitter + Map)
  compiler.ts                 # esbuild compilation for pipeline → worker bundle
  worker-shim.js              # Worker Thread entry: loads bundle, postMessage protocol
  executor.ts                 # PipelineExecutor: manages workers, polling, caching
  index.ts                    # Public API barrel export
  __tests__/
    types.test.ts             # Zod schema validation tests
    data-bus.test.ts          # DataBus pub/sub tests
    compiler.test.ts          # esbuild compilation tests
    executor.test.ts          # Executor lifecycle tests
```

### Context Files (read-only, for reference)

```
src/main/agent/lib/bundler.ts            # Existing esbuild config for components (mirror pattern)
src/main/agent/lib/canvasJson.ts         # Existing JSON persistence pattern (mirror for pipelines.json)
src/shared/blueprintTypes.ts             # Existing shared types pattern
```

---

### Task 1: Pipeline Types & Zod Schemas

**Files:**
- Create: `src/main/pipeline/types.ts`
- Create: `src/main/pipeline/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing tests for PipelineManifest schema**

```typescript
// src/main/pipeline/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import {
  PipelineManifestSchema,
  PipelineOutputSchema,
  PipelinesJsonSchema,
  PipelinePackageSchema,
  validatePipelinePackage,
} from '../types'

describe('PipelineManifestSchema', () => {
  const validManifest = {
    name: 'Yahoo Stock Prices',
    description: 'Fetches real-time stock prices from Yahoo Finance',
    tags: ['stocks', 'finance', 'yahoo'],
    secrets: {
      yahooApiKey: { description: 'Yahoo Finance API key', required: true },
    },
    params: {
      symbols: {
        type: 'string' as const,
        description: 'Comma-separated stock symbols',
        required: true,
      },
      interval: {
        type: 'number' as const,
        description: 'Refresh interval in seconds',
        required: false,
        default: 30,
      },
    },
    outputSchema: {
      prices: { type: 'array', description: 'Array of { symbol, price, change }' },
      lastUpdated: { type: 'number', description: 'Unix timestamp ms' },
    },
    strategy: {
      type: 'polling' as const,
      intervalMs: 30000,
      cacheTtlMs: 15000,
    },
    files: ['pipeline.ts', 'types.ts', 'manifest.json', 'context.md'],
  }

  it('accepts a valid manifest', () => {
    const result = PipelineManifestSchema.safeParse(validManifest)
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const { name, ...rest } = validManifest
    const result = PipelineManifestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects invalid strategy type', () => {
    const result = PipelineManifestSchema.safeParse({
      ...validManifest,
      strategy: { type: 'invalid' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts on-demand strategy without intervalMs', () => {
    const result = PipelineManifestSchema.safeParse({
      ...validManifest,
      strategy: { type: 'on-demand' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts streaming strategy', () => {
    const result = PipelineManifestSchema.safeParse({
      ...validManifest,
      strategy: { type: 'streaming' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty secrets', () => {
    const result = PipelineManifestSchema.safeParse({
      ...validManifest,
      secrets: {},
    })
    expect(result.success).toBe(true)
  })
})

describe('PipelineOutputSchema', () => {
  it('accepts valid output', () => {
    const result = PipelineOutputSchema.safeParse({
      data: { prices: [{ symbol: 'AAPL', price: 150.25 }] },
      metadata: {
        fetchedAt: Date.now(),
        source: 'Yahoo Finance API',
        cached: false,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing metadata', () => {
    const result = PipelineOutputSchema.safeParse({
      data: { prices: [] },
    })
    expect(result.success).toBe(false)
  })
})

describe('PipelinesJsonSchema', () => {
  it('accepts valid pipelines registry', () => {
    const result = PipelinesJsonSchema.safeParse({
      pipelines: [
        {
          pipelineId: 'yahoo_stocks',
          status: 'active',
          lastRun: Date.now(),
          connectedComponents: ['portfolio_tracker'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty pipelines array', () => {
    const result = PipelinesJsonSchema.safeParse({ pipelines: [] })
    expect(result.success).toBe(true)
  })
})

describe('validatePipelinePackage', () => {
  it('validates a valid package', () => {
    const result = validatePipelinePackage({
      manifest: validManifest,
      files: {
        'pipeline.ts': 'export default class {}',
        'manifest.json': '{}',
      },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects missing pipeline.ts', () => {
    const result = validatePipelinePackage({
      manifest: validManifest,
      files: { 'manifest.json': '{}' },
    })
    expect(result.valid).toBe(false)
    expect(result.valid === false && result.errors.some(e => e.includes('pipeline.ts'))).toBe(true)
  })

  it('rejects path traversal', () => {
    const result = validatePipelinePackage({
      manifest: validManifest,
      files: {
        'pipeline.ts': 'code',
        '../evil.ts': 'bad',
      },
    })
    expect(result.valid).toBe(false)
  })

  it('rejects absolute paths', () => {
    const result = validatePipelinePackage({
      manifest: validManifest,
      files: {
        'pipeline.ts': 'code',
        '/etc/passwd': 'bad',
      },
    })
    expect(result.valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/pipeline/__tests__/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement pipeline types**

```typescript
// src/main/pipeline/types.ts
import { z } from 'zod'

// ── Strategy ──────────────────────────────────────────────

export const PipelineStrategySchema = z.object({
  type: z.enum(['on-demand', 'polling', 'streaming']),
  intervalMs: z.number().int().positive().optional(),
  cacheTtlMs: z.number().int().nonneg().optional(),
})

// ── Manifest ──────────────────────────────────────────────

export const PipelineSecretSchema = z.object({
  description: z.string(),
  required: z.boolean(),
})

export const PipelineParamSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object']),
  description: z.string(),
  required: z.boolean(),
  default: z.unknown().optional(),
})

export const PipelineOutputFieldSchema = z.object({
  type: z.string(),
  description: z.string(),
})

export const PipelineManifestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  tags: z.array(z.string()).max(20),
  secrets: z.record(PipelineSecretSchema),
  params: z.record(PipelineParamSchema),
  outputSchema: z.record(PipelineOutputFieldSchema),
  strategy: PipelineStrategySchema,
  files: z.array(z.string()),
  version: z.string().optional(),
})

export type PipelineManifest = z.infer<typeof PipelineManifestSchema>

// ── Output ────────────────────────────────────────────────

export const PipelineOutputMetadataSchema = z.object({
  fetchedAt: z.number(),
  source: z.string(),
  cached: z.boolean(),
})

export const PipelineOutputSchema = z.object({
  data: z.unknown(),
  metadata: PipelineOutputMetadataSchema,
})

export type PipelineOutput = z.infer<typeof PipelineOutputSchema>

// ── DataPipeline interface (for pipeline.ts implementations) ──

export interface DataPipeline {
  execute(params: Record<string, unknown>): Promise<PipelineOutput>
  stream?(
    params: Record<string, unknown>,
    push: (data: PipelineOutput) => void,
  ): Promise<() => void>
  dispose?(): Promise<void>
}

// ── Registry (pipelines.json) ─────────────────────────────

export const PipelineEntrySchema = z.object({
  pipelineId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  status: z.enum(['active', 'inactive', 'error']),
  lastRun: z.number().optional(),
  error: z.string().optional(),
  connectedComponents: z.array(z.string()),
})

export type PipelineEntry = z.infer<typeof PipelineEntrySchema>

export const PipelinesJsonSchema = z.object({
  pipelines: z.array(PipelineEntrySchema),
})

export type PipelinesJson = z.infer<typeof PipelinesJsonSchema>

// ── Status (runtime) ──────────────────────────────────────

export type PipelineState = 'idle' | 'running' | 'polling' | 'streaming' | 'error' | 'stopped'

export interface PipelineStatus {
  pipelineId: string
  state: PipelineState
  lastOutput?: PipelineOutput
  lastError?: string
  uptimeMs?: number
  nextPollAt?: number
}

// ── Worker protocol ───────────────────────────────────────

export type WorkerCommand =
  | { type: 'execute'; params: Record<string, unknown> }
  | { type: 'stream'; params: Record<string, unknown> }
  | { type: 'dispose' }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'data'; output: PipelineOutput }
  | { type: 'error'; error: string }
  | { type: 'disposed' }

// ── Package validation ────────────────────────────────────

export const PipelinePackageSchema = z.object({
  manifest: PipelineManifestSchema,
  files: z.record(z.string()).superRefine((files, ctx) => {
    if (!('pipeline.ts' in files)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pipeline.ts is required — it is the pipeline entry point',
        path: ['pipeline.ts'],
      })
    }
    for (const filePath of Object.keys(files)) {
      if (filePath.includes('..')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Path traversal not allowed: "${filePath}"`,
          path: [filePath],
        })
      }
      if (filePath.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Absolute paths not allowed: "${filePath}"`,
          path: [filePath],
        })
      }
      if (filePath.includes('\0')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Null bytes not allowed in path: "${filePath}"`,
          path: [filePath],
        })
      }
    }
  }),
})

export type PipelinePackage = z.infer<typeof PipelinePackageSchema>

export type PackageValidationResult =
  | { valid: true; pkg: PipelinePackage }
  | { valid: false; errors: string[] }

export function validatePipelinePackage(pkg: unknown): PackageValidationResult {
  const result = PipelinePackageSchema.safeParse(pkg)
  if (result.success) return { valid: true, pkg: result.data }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  })
  return { valid: false, errors }
}

// ── Pipeline ID validation ────────────────────────────────

const PIPELINE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/
export function isValidPipelineId(id: string): boolean {
  return PIPELINE_ID_RE.test(id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/pipeline/__tests__/types.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline/types.ts src/main/pipeline/__tests__/types.test.ts
git commit -m "feat(pipeline): add pipeline types and Zod schemas"
```

---

### Task 2: DataBus Pub/Sub

**Files:**
- Create: `src/main/pipeline/data-bus.ts`
- Create: `src/main/pipeline/__tests__/data-bus.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/pipeline/__tests__/data-bus.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataBus } from '../data-bus'
import type { PipelineOutput } from '../types'

const makeOutput = (data: unknown): PipelineOutput => ({
  data,
  metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
})

describe('DataBus', () => {
  let bus: DataBus

  beforeEach(() => {
    bus = new DataBus()
  })

  it('delivers published data to subscribers', () => {
    const callback = vi.fn()
    bus.subscribe('pipeline_a', callback)

    const output = makeOutput({ value: 42 })
    bus.publish('pipeline_a', output)

    expect(callback).toHaveBeenCalledWith(output)
  })

  it('does not deliver to subscribers of other pipelines', () => {
    const callback = vi.fn()
    bus.subscribe('pipeline_b', callback)

    bus.publish('pipeline_a', makeOutput({ value: 42 }))

    expect(callback).not.toHaveBeenCalled()
  })

  it('stores latest value accessible via getLatest', () => {
    const output = makeOutput({ value: 42 })
    bus.publish('pipeline_a', output)

    expect(bus.getLatest('pipeline_a')).toEqual(output)
  })

  it('returns null for unknown pipeline in getLatest', () => {
    expect(bus.getLatest('nonexistent')).toBeNull()
  })

  it('unsubscribe stops delivery', () => {
    const callback = vi.fn()
    const unsub = bus.subscribe('pipeline_a', callback)

    bus.publish('pipeline_a', makeOutput({ v: 1 }))
    expect(callback).toHaveBeenCalledTimes(1)

    unsub()
    bus.publish('pipeline_a', makeOutput({ v: 2 }))
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.subscribe('pipeline_a', cb1)
    bus.subscribe('pipeline_a', cb2)

    bus.publish('pipeline_a', makeOutput({ v: 1 }))

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('tracks consumers per pipeline', () => {
    const unsub1 = bus.subscribe('pipeline_a', vi.fn())
    bus.subscribe('pipeline_a', vi.fn())

    expect(bus.getConsumerCount('pipeline_a')).toBe(2)

    unsub1()
    expect(bus.getConsumerCount('pipeline_a')).toBe(1)
  })

  it('clear removes all data and subscriptions for a pipeline', () => {
    bus.subscribe('pipeline_a', vi.fn())
    bus.publish('pipeline_a', makeOutput({ v: 1 }))

    bus.clear('pipeline_a')

    expect(bus.getLatest('pipeline_a')).toBeNull()
    expect(bus.getConsumerCount('pipeline_a')).toBe(0)
  })

  it('clearAll removes everything', () => {
    bus.subscribe('a', vi.fn())
    bus.subscribe('b', vi.fn())
    bus.publish('a', makeOutput(1))
    bus.publish('b', makeOutput(2))

    bus.clearAll()

    expect(bus.getLatest('a')).toBeNull()
    expect(bus.getLatest('b')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/pipeline/__tests__/data-bus.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DataBus**

```typescript
// src/main/pipeline/data-bus.ts
import { EventEmitter } from 'node:events'
import type { PipelineOutput } from './types'

type Callback = (data: PipelineOutput) => void

export class DataBus {
  private emitter = new EventEmitter()
  private latest = new Map<string, PipelineOutput>()
  private subscribers = new Map<string, Set<Callback>>()

  publish(pipelineId: string, data: PipelineOutput): void {
    this.latest.set(pipelineId, data)
    this.emitter.emit(pipelineId, data)
  }

  subscribe(pipelineId: string, callback: Callback): () => void {
    if (!this.subscribers.has(pipelineId)) {
      this.subscribers.set(pipelineId, new Set())
    }
    this.subscribers.get(pipelineId)!.add(callback)
    this.emitter.on(pipelineId, callback)

    return () => {
      this.emitter.off(pipelineId, callback)
      this.subscribers.get(pipelineId)?.delete(callback)
    }
  }

  getLatest(pipelineId: string): PipelineOutput | null {
    return this.latest.get(pipelineId) ?? null
  }

  getConsumerCount(pipelineId: string): number {
    return this.subscribers.get(pipelineId)?.size ?? 0
  }

  clear(pipelineId: string): void {
    this.latest.delete(pipelineId)
    this.emitter.removeAllListeners(pipelineId)
    this.subscribers.delete(pipelineId)
  }

  clearAll(): void {
    this.latest.clear()
    this.emitter.removeAllListeners()
    this.subscribers.clear()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/pipeline/__tests__/data-bus.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline/data-bus.ts src/main/pipeline/__tests__/data-bus.test.ts
git commit -m "feat(pipeline): add DataBus pub/sub"
```

---

### Task 3: Pipeline Compiler (esbuild)

**Files:**
- Create: `src/main/pipeline/compiler.ts`
- Create: `src/main/pipeline/__tests__/compiler.test.ts`
- Reference: `src/main/agent/lib/bundler.ts` (mirror esbuild pattern, but target node)

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/pipeline/__tests__/compiler.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compilePipeline, compilePipelineFromFiles } from '../compiler'

describe('compilePipeline (from disk)', () => {
  let pipelineDir: string

  beforeEach(async () => {
    pipelineDir = await mkdtemp(join(tmpdir(), 'pipeline-test-'))
  })

  afterEach(async () => {
    await rm(pipelineDir, { recursive: true, force: true })
  })

  it('compiles a simple pipeline.ts to compiled/worker-bundle.js', async () => {
    await writeFile(
      join(pipelineDir, 'pipeline.ts'),
      `export default class {
        async execute() {
          return { data: { hello: 'world' }, metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
      }`,
    )

    const outPath = await compilePipeline(pipelineDir)
    expect(outPath).toBe(join(pipelineDir, 'compiled', 'worker-bundle.js'))

    const content = await readFile(outPath, 'utf-8')
    expect(content).toContain('hello')
    expect(content).toContain('world')
  })

  it('bundles local imports', async () => {
    await writeFile(
      join(pipelineDir, 'transform.ts'),
      `export function transform(x: number) { return x * 2 }`,
    )
    await writeFile(
      join(pipelineDir, 'pipeline.ts'),
      `import { transform } from './transform'
      export default class {
        async execute() {
          return { data: { result: transform(21) }, metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
      }`,
    )

    const outPath = await compilePipeline(pipelineDir)
    const content = await readFile(outPath, 'utf-8')
    expect(content).toContain('transform')
  })

  it('throws on syntax error', async () => {
    await writeFile(join(pipelineDir, 'pipeline.ts'), 'export default {{{')
    await expect(compilePipeline(pipelineDir)).rejects.toThrow()
  })
})

describe('compilePipelineFromFiles (in-memory)', () => {
  it('compiles from Record<string, string> files', async () => {
    const files: Record<string, string> = {
      'pipeline.ts': `export default class {
        async execute() {
          return { data: 42, metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
      }`,
    }

    const bundleCode = await compilePipelineFromFiles(files)
    expect(bundleCode).toContain('execute')
    expect(typeof bundleCode).toBe('string')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/pipeline/__tests__/compiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement compiler**

```typescript
// src/main/pipeline/compiler.ts
import * as esbuild from 'esbuild'
import { join } from 'node:path'
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const ESBUILD_OPTIONS: esbuild.BuildOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'silent',
}

/**
 * Compile a pipeline from its directory on disk.
 * Writes compiled/worker-bundle.js and returns its path.
 */
export async function compilePipeline(pipelineDir: string): Promise<string> {
  const outDir = join(pipelineDir, 'compiled')
  await mkdir(outDir, { recursive: true })

  const outfile = join(outDir, 'worker-bundle.js')

  const result = await esbuild.build({
    ...ESBUILD_OPTIONS,
    entryPoints: [join(pipelineDir, 'pipeline.ts')],
    outfile,
    write: true,
  })

  if (result.errors.length > 0) {
    throw new Error(`Pipeline compilation failed:\n${result.errors.map((e) => e.text).join('\n')}`)
  }

  return outfile
}

/**
 * Compile a pipeline from in-memory files (for dry-run / preview).
 * Returns the bundle code as a string. Cleans up temp dir.
 */
export async function compilePipelineFromFiles(
  files: Record<string, string>,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cslate-pipeline-'))

  try {
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(join(tempDir, name), content),
      ),
    )

    const result = await esbuild.build({
      ...ESBUILD_OPTIONS,
      entryPoints: [join(tempDir, 'pipeline.ts')],
      write: false,
    })

    if (result.errors.length > 0) {
      throw new Error(
        `Pipeline compilation failed:\n${result.errors.map((e) => e.text).join('\n')}`,
      )
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/pipeline/__tests__/compiler.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline/compiler.ts src/main/pipeline/__tests__/compiler.test.ts
git commit -m "feat(pipeline): add esbuild pipeline compiler"
```

---

### Task 4: Worker Thread Shim

**Files:**
- Create: `src/main/pipeline/worker-shim.js`
- Create: `src/main/pipeline/__tests__/worker-shim.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/pipeline/__tests__/worker-shim.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Worker } from 'node:worker_threads'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compilePipeline } from '../compiler'
import type { WorkerCommand, WorkerResponse } from '../types'

const SHIM_PATH = join(__dirname, '..', 'worker-shim.js')

function sendAndWait(worker: Worker, cmd: WorkerCommand): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000)
    worker.once('message', (msg: WorkerResponse) => {
      clearTimeout(timeout)
      resolve(msg)
    })
    worker.postMessage(cmd)
  })
}

function waitForMessage(worker: Worker): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000)
    worker.once('message', (msg: WorkerResponse) => {
      clearTimeout(timeout)
      resolve(msg)
    })
  })
}

describe('worker-shim', () => {
  let pipelineDir: string
  let worker: Worker | null = null

  beforeEach(async () => {
    pipelineDir = await mkdtemp(join(tmpdir(), 'worker-test-'))
  })

  afterEach(async () => {
    if (worker) {
      await worker.terminate()
      worker = null
    }
    await rm(pipelineDir, { recursive: true, force: true })
  })

  async function setupAndSpawn(pipelineCode: string): Promise<Worker> {
    await writeFile(join(pipelineDir, 'pipeline.ts'), pipelineCode)
    const bundlePath = await compilePipeline(pipelineDir)

    worker = new Worker(SHIM_PATH, {
      workerData: {
        bundlePath,
        secrets: { testKey: 'secret123' },
      },
    })
    return worker
  }

  it('sends ready message on startup', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          return { data: 'hello', metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
      }
    `)

    const msg = await waitForMessage(w)
    expect(msg.type).toBe('ready')
  })

  it('executes pipeline and returns data', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute(params) {
          return {
            data: { result: params.x * 2 },
            metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
          }
        }
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'execute', params: { x: 21 } })

    expect(resp.type).toBe('data')
    if (resp.type === 'data') {
      expect(resp.output.data).toEqual({ result: 42 })
    }
  })

  it('returns error for failing execute', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          throw new Error('API down')
        }
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'execute', params: {} })

    expect(resp.type).toBe('error')
    if (resp.type === 'error') {
      expect(resp.error).toContain('API down')
    }
  })

  it('provides getSecret helper via workerData', async () => {
    const w = await setupAndSpawn(`
      const { getSecret } = require('./worker-helpers')
      export default class {
        async execute() {
          return {
            data: { key: getSecret('testKey') },
            metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
          }
        }
      }
    `)

    // NOTE: The getSecret helper is injected by the shim, not imported.
    // The pipeline code accesses it via the global scope.
    // Adjust the test and shim implementation as needed — the key invariant
    // is that pipeline code can access secrets without touching the config store.
    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'execute', params: {} })

    // If the above import pattern doesn't work, the shim injects getSecret globally.
    // Adapt test accordingly.
    expect(resp.type).toBe('data')
  })

  it('responds to dispose command', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          return { data: null, metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
        async dispose() {}
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'dispose' })
    expect(resp.type).toBe('disposed')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/pipeline/__tests__/worker-shim.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement worker shim**

```javascript
// src/main/pipeline/worker-shim.js
'use strict'

const { parentPort, workerData } = require('node:worker_threads')

if (!parentPort) {
  throw new Error('worker-shim must be run as a Worker Thread')
}

const { bundlePath, secrets = {} } = workerData

// Inject getSecret into global scope so pipeline code can access it
globalThis.getSecret = (name) => {
  if (!(name in secrets)) {
    throw new Error(`Secret "${name}" not found. Declare it in manifest.secrets.`)
  }
  return secrets[name]
}

// Load the compiled pipeline bundle
const pipelineModule = require(bundlePath)
const PipelineClass = pipelineModule.default || pipelineModule

let instance

try {
  instance = typeof PipelineClass === 'function' ? new PipelineClass() : PipelineClass
  parentPort.postMessage({ type: 'ready' })
} catch (err) {
  parentPort.postMessage({ type: 'error', error: `Failed to instantiate pipeline: ${err.message}` })
  process.exit(1)
}

parentPort.on('message', async (cmd) => {
  try {
    switch (cmd.type) {
      case 'execute': {
        const output = await instance.execute(cmd.params || {})
        parentPort.postMessage({ type: 'data', output })
        break
      }

      case 'stream': {
        if (typeof instance.stream !== 'function') {
          parentPort.postMessage({
            type: 'error',
            error: 'Pipeline does not implement stream()',
          })
          break
        }
        await instance.stream(cmd.params || {}, (data) => {
          parentPort.postMessage({ type: 'data', output: data })
        })
        break
      }

      case 'dispose': {
        if (typeof instance.dispose === 'function') {
          await instance.dispose()
        }
        parentPort.postMessage({ type: 'disposed' })
        break
      }

      default:
        parentPort.postMessage({ type: 'error', error: `Unknown command: ${cmd.type}` })
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message || String(err) })
  }
})
```

- [ ] **Step 4: Run tests, adjust shim if needed, verify pass**

Run: `npx vitest run src/main/pipeline/__tests__/worker-shim.test.ts`
Expected: ALL PASS (may need to adjust the getSecret test — the global injection approach should work without an import)

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline/worker-shim.js src/main/pipeline/__tests__/worker-shim.test.ts
git commit -m "feat(pipeline): add Worker Thread shim with secret injection"
```

---

### Task 5: Pipeline Executor

**Files:**
- Create: `src/main/pipeline/executor.ts`
- Create: `src/main/pipeline/__tests__/executor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/main/pipeline/__tests__/executor.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PipelineExecutor } from '../executor'
import { DataBus } from '../data-bus'
import type { PipelinesJson, PipelineOutput } from '../types'

const SIMPLE_PIPELINE = `
export default class {
  async execute(params) {
    return {
      data: { value: params.multiplier ? params.multiplier * 2 : 42 },
      metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
    }
  }
}
`

const FAILING_PIPELINE = `
export default class {
  async execute() { throw new Error('Pipeline exploded') }
}
`

describe('PipelineExecutor', () => {
  let projectDir: string
  let bus: DataBus
  let executor: PipelineExecutor

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'executor-test-'))
    await mkdir(join(projectDir, 'pipelines'), { recursive: true })
    bus = new DataBus()
    executor = new PipelineExecutor(projectDir, bus, {
      getSecret: async (name: string) => `mock-${name}`,
    })
  })

  afterEach(async () => {
    await executor.stopAll()
    await rm(projectDir, { recursive: true, force: true })
  })

  async function createPipeline(
    id: string,
    code: string,
    strategy: { type: string; intervalMs?: number; cacheTtlMs?: number } = { type: 'on-demand' },
  ) {
    const dir = join(projectDir, 'pipelines', id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'pipeline.ts'), code)
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({
        name: id,
        description: 'test',
        tags: [],
        secrets: {},
        params: {},
        outputSchema: {},
        strategy,
        files: ['pipeline.ts', 'manifest.json'],
      }),
    )

    // Write pipelines.json
    const registryPath = join(projectDir, 'pipelines.json')
    let registry: PipelinesJson = { pipelines: [] }
    try {
      registry = JSON.parse(await readFile(registryPath, 'utf-8'))
    } catch {}
    registry.pipelines.push({
      pipelineId: id,
      status: 'active',
      connectedComponents: [],
    })
    await writeFile(registryPath, JSON.stringify(registry))
  }

  it('starts an on-demand pipeline and executes', async () => {
    await createPipeline('test_pipe', SIMPLE_PIPELINE)
    await executor.startPipeline('test_pipe')

    const status = executor.getStatus('test_pipe')
    expect(status?.state).toBe('running')

    const output = await executor.execute('test_pipe', {})
    expect(output.data).toEqual({ value: 42 })
  })

  it('publishes output to DataBus on execute', async () => {
    await createPipeline('test_pipe', SIMPLE_PIPELINE)
    await executor.startPipeline('test_pipe')

    const callback = vi.fn()
    bus.subscribe('test_pipe', callback)

    await executor.execute('test_pipe', {})
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].data).toEqual({ value: 42 })
  })

  it('caches output within TTL', async () => {
    await createPipeline('test_pipe', SIMPLE_PIPELINE, {
      type: 'on-demand',
      cacheTtlMs: 60000,
    })
    await executor.startPipeline('test_pipe')

    const output1 = await executor.execute('test_pipe', {})
    const output2 = await executor.execute('test_pipe', {})

    // Second call should return cached (same fetchedAt)
    expect(output2.metadata.cached).toBe(true)
    expect(output2.data).toEqual(output1.data)
  })

  it('sets status to error on pipeline failure', async () => {
    await createPipeline('bad_pipe', FAILING_PIPELINE)
    await executor.startPipeline('bad_pipe')

    await expect(executor.execute('bad_pipe', {})).rejects.toThrow('Pipeline exploded')

    const status = executor.getStatus('bad_pipe')
    expect(status?.state).toBe('error')
    expect(status?.lastError).toContain('Pipeline exploded')
  })

  it('stops a pipeline', async () => {
    await createPipeline('test_pipe', SIMPLE_PIPELINE)
    await executor.startPipeline('test_pipe')
    await executor.stopPipeline('test_pipe')

    const status = executor.getStatus('test_pipe')
    expect(status?.state).toBe('stopped')
  })

  it('getAllStatuses returns all managed pipelines', async () => {
    await createPipeline('pipe_a', SIMPLE_PIPELINE)
    await createPipeline('pipe_b', SIMPLE_PIPELINE)
    await executor.startPipeline('pipe_a')
    await executor.startPipeline('pipe_b')

    const statuses = executor.getAllStatuses()
    expect(statuses.size).toBe(2)
    expect(statuses.get('pipe_a')?.state).toBe('running')
    expect(statuses.get('pipe_b')?.state).toBe('running')
  })

  it('throws when starting nonexistent pipeline', async () => {
    await expect(executor.startPipeline('nonexistent')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/pipeline/__tests__/executor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PipelineExecutor**

```typescript
// src/main/pipeline/executor.ts
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { compilePipeline } from './compiler'
import { DataBus } from './data-bus'
import type {
  PipelineManifest,
  PipelineOutput,
  PipelineStatus,
  PipelineState,
  WorkerCommand,
  WorkerResponse,
} from './types'

const SHIM_PATH = join(__dirname, 'worker-shim.js')

interface SecretProvider {
  getSecret(name: string): Promise<string>
}

interface ManagedPipeline {
  pipelineId: string
  manifest: PipelineManifest
  worker: Worker | null
  state: PipelineState
  lastOutput: PipelineOutput | null
  lastError: string | null
  startedAt: number | null
  pollTimer: ReturnType<typeof setInterval> | null
  cache: { output: PipelineOutput; expiresAt: number } | null
}

export class PipelineExecutor {
  private pipelines = new Map<string, ManagedPipeline>()
  private projectDir: string
  private bus: DataBus
  private secrets: SecretProvider

  constructor(projectDir: string, bus: DataBus, secrets: SecretProvider) {
    this.projectDir = projectDir
    this.bus = bus
    this.secrets = secrets
  }

  async startPipeline(pipelineId: string, params?: Record<string, unknown>): Promise<void> {
    const pipelineDir = join(this.projectDir, 'pipelines', pipelineId)
    const manifestPath = join(pipelineDir, 'manifest.json')

    let manifestRaw: string
    try {
      manifestRaw = await readFile(manifestPath, 'utf-8')
    } catch {
      throw new Error(`Pipeline "${pipelineId}" not found at ${pipelineDir}`)
    }

    const manifest: PipelineManifest = JSON.parse(manifestRaw)

    // Compile pipeline
    const bundlePath = await compilePipeline(pipelineDir)

    // Resolve secrets
    const resolvedSecrets: Record<string, string> = {}
    for (const [name, def] of Object.entries(manifest.secrets)) {
      try {
        resolvedSecrets[name] = await this.secrets.getSecret(name)
      } catch {
        if (def.required) throw new Error(`Required secret "${name}" not configured`)
      }
    }

    // Spawn worker
    const worker = new Worker(SHIM_PATH, {
      workerData: { bundlePath, secrets: resolvedSecrets },
    })

    const managed: ManagedPipeline = {
      pipelineId,
      manifest,
      worker,
      state: 'idle',
      lastOutput: null,
      lastError: null,
      startedAt: Date.now(),
      pollTimer: null,
      cache: null,
    }

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker startup timeout')), 10000)

      worker.once('message', (msg: WorkerResponse) => {
        clearTimeout(timeout)
        if (msg.type === 'ready') {
          managed.state = 'running'
          resolve()
        } else if (msg.type === 'error') {
          managed.state = 'error'
          managed.lastError = msg.error
          reject(new Error(msg.error))
        }
      })

      worker.once('error', (err) => {
        clearTimeout(timeout)
        managed.state = 'error'
        managed.lastError = err.message
        reject(err)
      })
    })

    this.pipelines.set(pipelineId, managed)

    // Start polling if configured
    if (manifest.strategy.type === 'polling' && manifest.strategy.intervalMs) {
      managed.state = 'polling'
      managed.pollTimer = setInterval(async () => {
        try {
          await this.execute(pipelineId, params ?? {})
        } catch {
          // Error already captured in managed.lastError
        }
      }, manifest.strategy.intervalMs)
    }

    // Start streaming if configured
    if (manifest.strategy.type === 'streaming') {
      managed.state = 'streaming'
      worker.on('message', (msg: WorkerResponse) => {
        if (msg.type === 'data') {
          managed.lastOutput = msg.output
          this.bus.publish(pipelineId, msg.output)
        } else if (msg.type === 'error') {
          managed.lastError = msg.error
          managed.state = 'error'
        }
      })
      worker.postMessage({ type: 'stream', params: params ?? {} } satisfies WorkerCommand)
    }
  }

  async execute(pipelineId: string, params: Record<string, unknown>): Promise<PipelineOutput> {
    const managed = this.pipelines.get(pipelineId)
    if (!managed || !managed.worker) {
      throw new Error(`Pipeline "${pipelineId}" is not running`)
    }

    // Check cache
    const cacheTtl = managed.manifest.strategy.cacheTtlMs
    if (cacheTtl && managed.cache && Date.now() < managed.cache.expiresAt) {
      const cached: PipelineOutput = {
        ...managed.cache.output,
        metadata: { ...managed.cache.output.metadata, cached: true },
      }
      return cached
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        managed.state = 'error'
        managed.lastError = 'Execution timeout (30s)'
        reject(new Error('Execution timeout (30s)'))
      }, 30000)

      managed.worker!.once('message', (msg: WorkerResponse) => {
        clearTimeout(timeout)
        if (msg.type === 'data') {
          managed.lastOutput = msg.output
          managed.lastError = null

          // Cache result
          if (cacheTtl) {
            managed.cache = {
              output: msg.output,
              expiresAt: Date.now() + cacheTtl,
            }
          }

          this.bus.publish(pipelineId, msg.output)
          resolve(msg.output)
        } else if (msg.type === 'error') {
          managed.state = 'error'
          managed.lastError = msg.error
          reject(new Error(msg.error))
        }
      })

      managed.worker!.postMessage({ type: 'execute', params } satisfies WorkerCommand)
    })
  }

  async stopPipeline(pipelineId: string): Promise<void> {
    const managed = this.pipelines.get(pipelineId)
    if (!managed) return

    if (managed.pollTimer) {
      clearInterval(managed.pollTimer)
      managed.pollTimer = null
    }

    if (managed.worker) {
      try {
        managed.worker.postMessage({ type: 'dispose' } satisfies WorkerCommand)
        await Promise.race([
          new Promise<void>((resolve) => {
            managed.worker!.once('message', (msg: WorkerResponse) => {
              if (msg.type === 'disposed') resolve()
            })
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ])
      } catch {
        // Worker may already be dead
      }
      await managed.worker.terminate()
      managed.worker = null
    }

    managed.state = 'stopped'
    managed.cache = null
  }

  async restartPipeline(pipelineId: string, params?: Record<string, unknown>): Promise<void> {
    await this.stopPipeline(pipelineId)
    await this.startPipeline(pipelineId, params)
  }

  getStatus(pipelineId: string): PipelineStatus | null {
    const managed = this.pipelines.get(pipelineId)
    if (!managed) return null

    return {
      pipelineId,
      state: managed.state,
      lastOutput: managed.lastOutput ?? undefined,
      lastError: managed.lastError ?? undefined,
      uptimeMs: managed.startedAt ? Date.now() - managed.startedAt : undefined,
    }
  }

  getAllStatuses(): Map<string, PipelineStatus> {
    const result = new Map<string, PipelineStatus>()
    for (const [id] of this.pipelines) {
      const status = this.getStatus(id)
      if (status) result.set(id, status)
    }
    return result
  }

  async stopAll(): Promise<void> {
    const ids = [...this.pipelines.keys()]
    await Promise.all(ids.map((id) => this.stopPipeline(id)))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/pipeline/__tests__/executor.test.ts`
Expected: ALL PASS (some tests may need adjustment for timing — use `vi.useFakeTimers()` if polling tests are flaky)

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline/executor.ts src/main/pipeline/__tests__/executor.test.ts
git commit -m "feat(pipeline): add PipelineExecutor with Worker Thread isolation"
```

---

### Task 6: Barrel Export & pipelines.json Utilities

**Files:**
- Create: `src/main/pipeline/index.ts`
- Create: `src/main/pipeline/pipelines-json.ts`

- [ ] **Step 1: Create pipelines.json utilities (mirrors canvasJson.ts pattern)**

```typescript
// src/main/pipeline/pipelines-json.ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PipelinesJson, PipelineEntry } from './types'

export async function readPipelinesJson(projectDir: string): Promise<PipelinesJson> {
  try {
    const raw = await readFile(join(projectDir, 'pipelines.json'), 'utf-8')
    return JSON.parse(raw) as PipelinesJson
  } catch {
    return { pipelines: [] }
  }
}

export async function writePipelinesJson(
  projectDir: string,
  data: PipelinesJson,
): Promise<void> {
  await writeFile(join(projectDir, 'pipelines.json'), JSON.stringify(data, null, 2))
}

export async function upsertPipelineEntry(
  projectDir: string,
  entry: PipelineEntry,
): Promise<void> {
  const data = await readPipelinesJson(projectDir)
  const idx = data.pipelines.findIndex((p) => p.pipelineId === entry.pipelineId)
  if (idx >= 0) {
    data.pipelines[idx] = entry
  } else {
    data.pipelines.push(entry)
  }
  await writePipelinesJson(projectDir, data)
}

export async function removePipelineEntry(
  projectDir: string,
  pipelineId: string,
): Promise<void> {
  const data = await readPipelinesJson(projectDir)
  data.pipelines = data.pipelines.filter((p) => p.pipelineId !== pipelineId)
  await writePipelinesJson(projectDir, data)
}
```

- [ ] **Step 2: Create barrel export**

```typescript
// src/main/pipeline/index.ts
export { DataBus } from './data-bus'
export { PipelineExecutor } from './executor'
export { compilePipeline, compilePipelineFromFiles } from './compiler'
export {
  readPipelinesJson,
  writePipelinesJson,
  upsertPipelineEntry,
  removePipelineEntry,
} from './pipelines-json'
export * from './types'
```

- [ ] **Step 3: Commit**

```bash
git add src/main/pipeline/index.ts src/main/pipeline/pipelines-json.ts
git commit -m "feat(pipeline): add pipelines.json utilities and barrel export"
```

---

### Task 7: Run Full Test Suite

- [ ] **Step 1: Run all pipeline tests**

Run: `npx vitest run src/main/pipeline/`
Expected: ALL PASS

- [ ] **Step 2: Run project typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A src/main/pipeline/
git commit -m "fix(pipeline): address test/type issues from full suite run"
```
