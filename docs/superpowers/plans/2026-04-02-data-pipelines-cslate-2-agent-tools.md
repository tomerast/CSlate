# Data Pipelines — CSlate Agent Tools & Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 6 agent tools for pipeline CRUD, a pipeline-wirer skill, and pipeline prompt fragments — enabling the AI agent to build, validate, search, and wire pipelines.

**Architecture:** Each tool follows the existing `CSTool` pattern (Zod schema input, `call()` method, `toAISDKTool()` conversion). Tools are registered in `buildToolSet()`. The pipeline-wirer skill is a multi-step workflow that connects existing pipelines to components.

**Tech Stack:** TypeScript, Zod, AI SDK tool format, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-data-pipelines-design.md` — Section 4

**Depends on:** Plan 1 (Runtime Core) — imports from `src/main/pipeline/`

**Produces:** Pipeline tools in `src/main/agent/tools/`, pipeline-wirer skill, prompt fragments

---

## File Map

### New Files

```
src/main/agent/tools/
  validatePipelineManifest.ts              # Validate manifest against Zod schema
  writePipeline.ts                         # Write pipeline to disk + compile + register
  dryRunPipeline.ts                        # Ephemeral execution for verification
  readPipelineManifest.ts                  # Read existing pipeline manifest
  scanLocalPipelines.ts                    # Token-based local pipeline search
  searchPipelineBlueprints.ts              # CSlate-server pipeline search

src/main/agent/skills/
  pipeline-wirer.ts                        # Wire existing pipeline to component

src/main/agent/tools/__tests__/
  validatePipelineManifest.test.ts
  writePipeline.test.ts
  dryRunPipeline.test.ts
  readPipelineManifest.test.ts
  scanLocalPipelines.test.ts
```

### Modified Files

```
src/main/agent/tools/index.ts             # Register pipeline tools in buildToolSet()
src/main/agent/skills/index.ts            # Register pipeline-wirer skill
src/main/agent/prompts/fragments.ts       # Add pipeline prompt fragments
```

### Context Files (read-only, for reference)

```
src/main/agent/tools/validateManifest.ts   # Mirror pattern for validatePipelineManifest
src/main/agent/tools/writeComponent.ts     # Mirror pattern for writePipeline
src/main/agent/tools/renderComponent.ts    # Mirror pattern for dryRunPipeline
src/main/agent/tools/readManifest.ts       # Mirror pattern for readPipelineManifest
src/main/agent/tools/scanLocalComponents.ts # Mirror pattern for scanLocalPipelines
src/main/agent/tools/searchBlueprints.ts   # Mirror pattern for searchPipelineBlueprints
src/main/agent/tools/types.ts             # CSTool interface
src/main/agent/skills/state-wirer.ts      # Mirror pattern for pipeline-wirer
```

---

### Task 1: validatePipelineManifest Tool

**Files:**
- Create: `src/main/agent/tools/validatePipelineManifest.ts`
- Create: `src/main/agent/tools/__tests__/validatePipelineManifest.test.ts`
- Reference: `src/main/agent/tools/validateManifest.ts` (mirror this pattern exactly)

- [ ] **Step 1: Read `validateManifest.ts` to understand the CSTool pattern**

Read: `src/main/agent/tools/validateManifest.ts` and `src/main/agent/tools/types.ts`

- [ ] **Step 2: Write failing test**

```typescript
// src/main/agent/tools/__tests__/validatePipelineManifest.test.ts
import { describe, it, expect } from 'vitest'
import { createValidatePipelineManifestTool } from '../validatePipelineManifest'

describe('validatePipelineManifest', () => {
  const tool = createValidatePipelineManifestTool()

  const validManifest = {
    name: 'Test Pipeline',
    description: 'Fetches test data',
    tags: ['test'],
    secrets: {},
    params: {},
    outputSchema: { result: { type: 'object', description: 'Test result' } },
    strategy: { type: 'on-demand' },
    files: ['pipeline.ts', 'manifest.json'],
  }

  it('returns valid for correct manifest', async () => {
    const result = await tool.call({ manifest: validManifest })
    expect(result.data.valid).toBe(true)
    expect(result.data.errors).toEqual([])
  })

  it('returns errors for invalid manifest', async () => {
    const result = await tool.call({ manifest: { name: '' } })
    expect(result.data.valid).toBe(false)
    expect(result.data.errors.length).toBeGreaterThan(0)
  })

  it('is read-only and concurrent-safe', () => {
    expect(tool.isReadOnly({})).toBe(true)
    expect(tool.isConcurrencySafe({})).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/main/agent/tools/__tests__/validatePipelineManifest.test.ts`

- [ ] **Step 4: Implement the tool**

Mirror the pattern from `validateManifest.ts` but use `PipelineManifestSchema` from `src/main/pipeline/types`:

```typescript
// src/main/agent/tools/validatePipelineManifest.ts
import { z } from 'zod'
import { buildTool } from './build-tool'
import { PipelineManifestSchema } from '../../pipeline/types'

export function createValidatePipelineManifestTool() {
  return buildTool({
    name: 'validatePipelineManifest',
    description:
      'Validate a pipeline manifest against the PipelineManifest schema. Call this BEFORE writePipeline to catch errors early.',
    inputSchema: z.object({
      manifest: z.unknown().describe('The pipeline manifest object to validate'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ manifest }) => {
      const result = PipelineManifestSchema.safeParse(manifest)
      if (result.success) {
        return { data: { valid: true, errors: [] } }
      }
      const errors = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })
      return { data: { valid: false, errors } }
    },
  })
}
```

Note: Check if the project uses `buildTool()` or a different factory. Read `src/main/agent/tools/validateManifest.ts` for the exact pattern and adapt accordingly.

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run src/main/agent/tools/__tests__/validatePipelineManifest.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/tools/validatePipelineManifest.ts src/main/agent/tools/__tests__/validatePipelineManifest.test.ts
git commit -m "feat(agent): add validatePipelineManifest tool"
```

---

### Task 2: readPipelineManifest Tool

**Files:**
- Create: `src/main/agent/tools/readPipelineManifest.ts`
- Create: `src/main/agent/tools/__tests__/readPipelineManifest.test.ts`
- Reference: `src/main/agent/tools/readManifest.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/main/agent/tools/__tests__/readPipelineManifest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createReadPipelineManifestTool } from '../readPipelineManifest'

describe('readPipelineManifest', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'read-manifest-test-'))
    await mkdir(join(projectDir, 'pipelines', 'test_pipe'), { recursive: true })
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it('reads an existing pipeline manifest', async () => {
    const manifest = {
      name: 'Test',
      description: 'Test pipeline',
      tags: [],
      secrets: {},
      params: {},
      outputSchema: {},
      strategy: { type: 'on-demand' },
      files: ['pipeline.ts'],
    }
    await writeFile(
      join(projectDir, 'pipelines', 'test_pipe', 'manifest.json'),
      JSON.stringify(manifest),
    )

    const tool = createReadPipelineManifestTool()
    const result = await tool.call(
      { pipelineId: 'test_pipe' },
      { projectDir },
    )
    expect(result.data.manifest).toEqual(manifest)
  })

  it('returns error for nonexistent pipeline', async () => {
    const tool = createReadPipelineManifestTool()
    const result = await tool.call(
      { pipelineId: 'nonexistent' },
      { projectDir },
    )
    expect(result.data.error).toBeDefined()
  })

  it('is read-only and concurrent-safe', () => {
    const tool = createReadPipelineManifestTool()
    expect(tool.isReadOnly({ pipelineId: 'x' })).toBe(true)
    expect(tool.isConcurrencySafe({ pipelineId: 'x' })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Implement**

```typescript
// src/main/agent/tools/readPipelineManifest.ts
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildTool } from './build-tool'
import { safePath } from '../../lib/paths'

export function createReadPipelineManifestTool() {
  return buildTool({
    name: 'readPipelineManifest',
    description: 'Read the manifest.json of an existing pipeline by its ID.',
    inputSchema: z.object({
      pipelineId: z.string().describe('The pipeline ID (e.g. "yahoo_stocks")'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ pipelineId }, context) => {
      try {
        const manifestPath = safePath(
          join(context!.projectDir, 'pipelines', pipelineId),
          'manifest.json',
        )
        const raw = await readFile(manifestPath, 'utf-8')
        return { data: { manifest: JSON.parse(raw) } }
      } catch (err) {
        return {
          data: { error: `Could not read pipeline "${pipelineId}": ${(err as Error).message}` },
        }
      }
    },
  })
}
```

Note: Adapt `safePath` usage to match how the existing `readManifest.ts` tool handles path safety.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/readPipelineManifest.ts src/main/agent/tools/__tests__/readPipelineManifest.test.ts
git commit -m "feat(agent): add readPipelineManifest tool"
```

---

### Task 3: writePipeline Tool

**Files:**
- Create: `src/main/agent/tools/writePipeline.ts`
- Create: `src/main/agent/tools/__tests__/writePipeline.test.ts`
- Reference: `src/main/agent/tools/writeComponent.ts`

- [ ] **Step 1: Read `writeComponent.ts` to understand the full pattern (file writing, bundling, canvas.json update)**

- [ ] **Step 2: Write failing test**

```typescript
// src/main/agent/tools/__tests__/writePipeline.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWritePipelineTool } from '../writePipeline'

describe('writePipeline', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'write-pipeline-test-'))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  const validManifest = {
    name: 'Test Pipeline',
    description: 'Test',
    tags: ['test'],
    secrets: {},
    params: {},
    outputSchema: {},
    strategy: { type: 'on-demand' },
    files: ['pipeline.ts', 'manifest.json', 'context.md'],
  }

  const files = {
    'pipeline.ts': `export default class {
      async execute() {
        return { data: 42, metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
      }
    }`,
    'context.md': 'A test pipeline.',
  }

  it('writes pipeline files to disk', async () => {
    const tool = createWritePipelineTool()
    const result = await tool.call(
      { pipelineId: 'test_pipe', files, manifest: validManifest },
      { projectDir },
    )

    expect(result.data.success).toBe(true)

    // Verify files on disk
    const pipelineTs = await readFile(join(projectDir, 'pipelines', 'test_pipe', 'pipeline.ts'), 'utf-8')
    expect(pipelineTs).toContain('execute')

    const manifestJson = await readFile(join(projectDir, 'pipelines', 'test_pipe', 'manifest.json'), 'utf-8')
    expect(JSON.parse(manifestJson).name).toBe('Test Pipeline')
  })

  it('compiles worker bundle', async () => {
    const tool = createWritePipelineTool()
    await tool.call(
      { pipelineId: 'test_pipe', files, manifest: validManifest },
      { projectDir },
    )

    await access(join(projectDir, 'pipelines', 'test_pipe', 'compiled', 'worker-bundle.js'))
  })

  it('updates pipelines.json', async () => {
    const tool = createWritePipelineTool()
    await tool.call(
      { pipelineId: 'test_pipe', files, manifest: validManifest },
      { projectDir },
    )

    const registry = JSON.parse(
      await readFile(join(projectDir, 'pipelines.json'), 'utf-8'),
    )
    expect(registry.pipelines[0].pipelineId).toBe('test_pipe')
    expect(registry.pipelines[0].status).toBe('inactive')
  })

  it('rejects invalid pipeline ID', async () => {
    const tool = createWritePipelineTool()
    const result = await tool.call(
      { pipelineId: '../evil', files, manifest: validManifest },
      { projectDir },
    )
    expect(result.data.success).toBe(false)
    expect(result.data.errors?.length).toBeGreaterThan(0)
  })

  it('rejects invalid manifest', async () => {
    const tool = createWritePipelineTool()
    const result = await tool.call(
      { pipelineId: 'test_pipe', files, manifest: { name: '' } },
      { projectDir },
    )
    expect(result.data.success).toBe(false)
  })

  it('is not read-only and not concurrent-safe', () => {
    const tool = createWritePipelineTool()
    expect(tool.isReadOnly({})).toBe(false)
    expect(tool.isConcurrencySafe({})).toBe(false)
  })
})
```

- [ ] **Step 3: Run test, verify fail**

- [ ] **Step 4: Implement writePipeline**

```typescript
// src/main/agent/tools/writePipeline.ts
import { z } from 'zod'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { buildTool } from './build-tool'
import { isValidPipelineId, PipelineManifestSchema } from '../../pipeline/types'
import { compilePipeline } from '../../pipeline/compiler'
import { upsertPipelineEntry } from '../../pipeline/pipelines-json'

function stripMarkdownFences(code: string): string {
  return code.replace(/^```\w*\n?/gm, '').replace(/\n?```$/gm, '')
}

export function createWritePipelineTool() {
  return buildTool({
    name: 'writePipeline',
    description:
      'Write a data pipeline to disk. Writes source files, compiles the worker bundle, and registers in pipelines.json. Call validatePipelineManifest first.',
    inputSchema: z.object({
      pipelineId: z.string().describe('Snake_case pipeline ID (e.g. "yahoo_stocks")'),
      files: z.record(z.string()).describe('Source files: { "pipeline.ts": "...", "types.ts": "...", ... }'),
      manifest: z.unknown().describe('Pipeline manifest object'),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async ({ pipelineId, files, manifest }, context) => {
      // Validate ID
      if (!isValidPipelineId(pipelineId)) {
        return {
          data: {
            success: false,
            errors: [`Invalid pipeline ID "${pipelineId}". Must match /^[a-z0-9][a-z0-9_-]*$/`],
          },
        }
      }

      // Validate manifest
      const manifestResult = PipelineManifestSchema.safeParse(manifest)
      if (!manifestResult.success) {
        const errors = manifestResult.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        )
        return { data: { success: false, errors } }
      }

      const projectDir = context!.projectDir
      const pipelineDir = join(projectDir, 'pipelines', pipelineId)

      try {
        // Write source files
        await mkdir(pipelineDir, { recursive: true })
        for (const [name, content] of Object.entries(files)) {
          await writeFile(join(pipelineDir, name), stripMarkdownFences(content))
        }

        // Write manifest.json
        await writeFile(
          join(pipelineDir, 'manifest.json'),
          JSON.stringify(manifestResult.data, null, 2),
        )

        // Compile worker bundle
        const bundlePath = await compilePipeline(pipelineDir)

        // Update pipelines.json
        await upsertPipelineEntry(projectDir, {
          pipelineId,
          status: 'inactive',
          connectedComponents: [],
        })

        return {
          data: {
            success: true,
            path: pipelineDir,
            bundle: bundlePath,
          },
        }
      } catch (err) {
        return {
          data: {
            success: false,
            errors: [(err as Error).message],
          },
        }
      }
    },
  })
}
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/tools/writePipeline.ts src/main/agent/tools/__tests__/writePipeline.test.ts
git commit -m "feat(agent): add writePipeline tool"
```

---

### Task 4: dryRunPipeline Tool

**Files:**
- Create: `src/main/agent/tools/dryRunPipeline.ts`
- Create: `src/main/agent/tools/__tests__/dryRunPipeline.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/main/agent/tools/__tests__/dryRunPipeline.test.ts
import { describe, it, expect } from 'vitest'
import { createDryRunPipelineTool } from '../dryRunPipeline'

describe('dryRunPipeline', () => {
  const tool = createDryRunPipelineTool()

  it('executes pipeline code and returns sample output', async () => {
    const files = {
      'pipeline.ts': `export default class {
        async execute(params) {
          return {
            data: { greeting: 'hello ' + (params.name || 'world') },
            metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
          }
        }
      }`,
    }

    const result = await tool.call({
      files,
      params: { name: 'CSlate' },
    })

    expect(result.data.success).toBe(true)
    expect(result.data.output?.data).toEqual({ greeting: 'hello CSlate' })
    expect(result.data.executionTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns error for failing pipeline', async () => {
    const files = {
      'pipeline.ts': `export default class {
        async execute() { throw new Error('API key invalid') }
      }`,
    }

    const result = await tool.call({ files, params: {} })

    expect(result.data.success).toBe(false)
    expect(result.data.errors?.some((e: string) => e.includes('API key invalid'))).toBe(true)
  })

  it('returns error for syntax errors', async () => {
    const files = {
      'pipeline.ts': `export default {{{`,
    }

    const result = await tool.call({ files, params: {} })

    expect(result.data.success).toBe(false)
  })

  it('is not read-only', () => {
    expect(tool.isReadOnly({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Implement dryRunPipeline**

```typescript
// src/main/agent/tools/dryRunPipeline.ts
import { z } from 'zod'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { buildTool } from './build-tool'
import { compilePipelineFromFiles } from '../../pipeline/compiler'
import type { WorkerResponse, PipelineOutput } from '../../pipeline/types'

const SHIM_PATH = join(__dirname, '..', '..', 'pipeline', 'worker-shim.js')
const TIMEOUT_MS = 30_000

export function createDryRunPipelineTool() {
  return buildTool({
    name: 'dryRunPipeline',
    description:
      'Execute a pipeline once with real data to verify it works. Returns sample output and execution time. Use this to test pipeline code before writing to disk.',
    inputSchema: z.object({
      files: z.record(z.string()).describe('Pipeline source files (must include pipeline.ts)'),
      params: z.record(z.unknown()).optional().describe('Params to pass to execute()'),
      secrets: z.record(z.string()).optional().describe('Secrets to inject (for testing)'),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async ({ files, params = {}, secrets = {} }) => {
      const startTime = Date.now()

      // Compile to temp bundle
      let bundleCode: string
      try {
        bundleCode = await compilePipelineFromFiles(files)
      } catch (err) {
        return {
          data: {
            success: false,
            errors: [`Compilation failed: ${(err as Error).message}`],
            executionTimeMs: Date.now() - startTime,
          },
        }
      }

      // Write bundle to temp file (Worker needs a file path)
      const tempDir = await mkdtemp(join(tmpdir(), 'cslate-dryrun-'))
      const bundlePath = join(tempDir, 'worker-bundle.js')
      await writeFile(bundlePath, bundleCode)

      try {
        const output = await new Promise<PipelineOutput>((resolve, reject) => {
          const timeout = setTimeout(() => {
            worker.terminate()
            reject(new Error(`Execution timed out after ${TIMEOUT_MS}ms`))
          }, TIMEOUT_MS)

          const worker = new Worker(SHIM_PATH, {
            workerData: { bundlePath, secrets },
          })

          let ready = false

          worker.on('message', (msg: WorkerResponse) => {
            if (msg.type === 'ready') {
              ready = true
              worker.postMessage({ type: 'execute', params })
            } else if (msg.type === 'data') {
              clearTimeout(timeout)
              worker.terminate()
              resolve(msg.output)
            } else if (msg.type === 'error') {
              clearTimeout(timeout)
              worker.terminate()
              reject(new Error(msg.error))
            }
          })

          worker.on('error', (err) => {
            clearTimeout(timeout)
            reject(err)
          })
        })

        return {
          data: {
            success: true,
            output,
            executionTimeMs: Date.now() - startTime,
          },
        }
      } catch (err) {
        return {
          data: {
            success: false,
            errors: [(err as Error).message],
            executionTimeMs: Date.now() - startTime,
          },
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    },
  })
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/dryRunPipeline.ts src/main/agent/tools/__tests__/dryRunPipeline.test.ts
git commit -m "feat(agent): add dryRunPipeline tool"
```

---

### Task 5: scanLocalPipelines Tool

**Files:**
- Create: `src/main/agent/tools/scanLocalPipelines.ts`
- Create: `src/main/agent/tools/__tests__/scanLocalPipelines.test.ts`
- Reference: `src/main/agent/tools/scanLocalComponents.ts` (mirror the token-based scoring pattern)

- [ ] **Step 1: Read `scanLocalComponents.ts` to understand the scoring pattern**

- [ ] **Step 2: Write failing test**

```typescript
// src/main/agent/tools/__tests__/scanLocalPipelines.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createScanLocalPipelinesTool } from '../scanLocalPipelines'

describe('scanLocalPipelines', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'scan-pipelines-test-'))

    // Create two test pipelines
    for (const [id, manifest] of [
      ['yahoo_stocks', { name: 'Yahoo Stock Prices', description: 'Fetches stock prices from Yahoo Finance', tags: ['stocks', 'finance'] }],
      ['weather_api', { name: 'Weather Data', description: 'Fetches weather forecasts from OpenWeather', tags: ['weather', 'forecast'] }],
    ] as const) {
      const dir = join(projectDir, 'pipelines', id)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'manifest.json'), JSON.stringify({
        ...manifest,
        secrets: {}, params: {}, outputSchema: {},
        strategy: { type: 'on-demand' }, files: ['pipeline.ts'],
      }))
      await writeFile(join(dir, 'pipeline.ts'), `export default class {}`)
    }
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it('finds pipelines matching query', async () => {
    const tool = createScanLocalPipelinesTool()
    const result = await tool.call({ query: 'stock prices' }, { projectDir })

    expect(result.data.matches.length).toBeGreaterThan(0)
    expect(result.data.matches[0].pipelineId).toBe('yahoo_stocks')
  })

  it('returns empty for no matches', async () => {
    const tool = createScanLocalPipelinesTool()
    const result = await tool.call({ query: 'cryptocurrency blockchain' }, { projectDir })

    expect(result.data.matches.length).toBe(0)
  })

  it('includes source files in results', async () => {
    const tool = createScanLocalPipelinesTool()
    const result = await tool.call({ query: 'stock' }, { projectDir })

    expect(result.data.matches[0].files).toBeDefined()
    expect(result.data.matches[0].files['pipeline.ts']).toBeDefined()
  })
})
```

- [ ] **Step 3: Implement (mirror scanLocalComponents.ts pattern, adapted for pipeline directory structure)**

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/scanLocalPipelines.ts src/main/agent/tools/__tests__/scanLocalPipelines.test.ts
git commit -m "feat(agent): add scanLocalPipelines tool"
```

---

### Task 6: searchPipelineBlueprints Tool

**Files:**
- Create: `src/main/agent/tools/searchPipelineBlueprints.ts`
- Reference: `src/main/agent/tools/searchBlueprints.ts` (mirror pattern, use `serverClient.searchPipelines()`)

- [ ] **Step 1: Read `searchBlueprints.ts` to understand the server client integration pattern**

- [ ] **Step 2: Implement searchPipelineBlueprints**

Mirror `searchBlueprints.ts` exactly but:
- Call `serverClient.searchPipelines(query, limit)` instead of `serverClient.search()`
- Fall back to `scanLocalPipelines` when server is unavailable
- Same CSTool pattern (read-only, concurrent-safe)

```typescript
// src/main/agent/tools/searchPipelineBlueprints.ts
import { z } from 'zod'
import { buildTool } from './build-tool'
import type { CSlateServerClient } from '../../server/CSlateServerClient'

export function createSearchPipelineBlueprintsTool(
  serverClient: CSlateServerClient | null,
) {
  return buildTool({
    name: 'searchPipelineBlueprints',
    description:
      'Search the CSlate server catalog for existing pipeline blueprints. Falls back to local search if server is unavailable.',
    inputSchema: z.object({
      query: z.string().describe('Search query (e.g. "stock prices yahoo finance")'),
      limit: z.number().int().min(1).max(20).optional().describe('Max results (default 5)'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ query, limit = 5 }) => {
      if (!serverClient) {
        return {
          data: {
            results: [],
            total: 0,
            source: 'none',
            message: 'CSlate server not configured. Use scanLocalPipelines for local search.',
          },
        }
      }

      try {
        const response = await serverClient.searchPipelines(query, limit)
        return {
          data: {
            results: response.results,
            total: response.total,
            source: 'server',
          },
        }
      } catch (err) {
        return {
          data: {
            results: [],
            total: 0,
            source: 'error',
            message: `Server search failed: ${(err as Error).message}. Use scanLocalPipelines for local search.`,
          },
        }
      }
    },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/tools/searchPipelineBlueprints.ts
git commit -m "feat(agent): add searchPipelineBlueprints tool"
```

---

### Task 7: Register Pipeline Tools in buildToolSet

**Files:**
- Modify: `src/main/agent/tools/index.ts`

- [ ] **Step 1: Read current `index.ts` to understand registration pattern**

Read: `src/main/agent/tools/index.ts`

- [ ] **Step 2: Add pipeline tool imports and registration**

Add to the imports section:
```typescript
import { createValidatePipelineManifestTool } from './validatePipelineManifest'
import { createReadPipelineManifestTool } from './readPipelineManifest'
import { createWritePipelineTool } from './writePipeline'
import { createDryRunPipelineTool } from './dryRunPipeline'
import { createScanLocalPipelinesTool } from './scanLocalPipelines'
import { createSearchPipelineBlueprintsTool } from './searchPipelineBlueprints'
```

Add to the tool array inside `buildToolSet()`:
```typescript
createValidatePipelineManifestTool(),
createReadPipelineManifestTool(),
createWritePipelineTool(),
createDryRunPipelineTool(),
createScanLocalPipelinesTool(),
createSearchPipelineBlueprintsTool(deps.serverClient),
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/main/agent/tools/index.ts
git commit -m "feat(agent): register pipeline tools in buildToolSet"
```

---

### Task 8: Pipeline Prompt Fragments

**Files:**
- Modify: `src/main/agent/prompts/fragments.ts`

- [ ] **Step 1: Read current fragments.ts**

- [ ] **Step 2: Add pipeline-specific prompt fragments**

Add these new exported fragments (follow the existing pattern for how fragments are structured):

```typescript
export const PIPELINE_INTERFACE_SPEC = `
## Data Pipeline Interface

Every pipeline must default-export a class implementing DataPipeline:

\`\`\`typescript
interface DataPipeline {
  execute(params: Record<string, unknown>): Promise<PipelineOutput>
  stream?(params: Record<string, unknown>, push: (data: PipelineOutput) => void): Promise<() => void>
  dispose?(): Promise<void>
}

interface PipelineOutput {
  data: unknown
  metadata: { fetchedAt: number; source: string; cached: boolean }
}
\`\`\`

### Pipeline Rules
- Pipeline code runs in a Node.js Worker Thread — full Node.js access (http, https, etc.)
- Access secrets via global \`getSecret(name)\` — NEVER hardcode API keys
- Declare all required secrets in manifest.secrets
- Return PipelineOutput with proper metadata (source name, timestamp)
- Handle API errors gracefully — throw with descriptive messages
- For polling pipelines: execute() is called on each tick, keep it stateless
- For streaming pipelines: stream() opens a persistent connection, pushes data via callback
`

export const PIPELINE_COMPONENT_WIRING = `
## Connecting Pipelines to Components

Components access pipeline data via the bridge API:

\`\`\`typescript
// One-time read
const data = await bridge.pipeline('pipeline_id')

// Subscribe to live updates
const unsub = bridge.pipelineSubscribe('pipeline_id', (data) => {
  setState(data)
})
\`\`\`

### In component manifest, declare pipeline dependencies:
\`\`\`json
{
  "pipelines": {
    "stockData": {
      "pipelineId": "yahoo_stocks",
      "description": "Real-time stock prices",
      "mappings": { "prices": "yahoo_stocks.data.prices" }
    }
  }
}
\`\`\`

### Loading pattern (CRITICAL — same as bridge.fetch):
- NEVER initialize loading=true before pipeline data arrives
- Initialize with seed/placeholder data
- Show seed data immediately, update when pipeline delivers
`
```

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/prompts/fragments.ts
git commit -m "feat(agent): add pipeline prompt fragments"
```

---

### Task 9: Pipeline-Wirer Skill

**Files:**
- Create: `src/main/agent/skills/pipeline-wirer.ts`
- Modify: `src/main/agent/skills/index.ts`
- Reference: `src/main/agent/skills/state-wirer.ts` (mirror pattern)

- [ ] **Step 1: Read `state-wirer.ts` to understand skill structure**

- [ ] **Step 2: Implement pipeline-wirer skill**

```typescript
// src/main/agent/skills/pipeline-wirer.ts
import type { SkillConfig } from './types'
import { PIPELINE_COMPONENT_WIRING } from '../prompts/fragments'

export function createPipelineWirerSkill(tools: Record<string, any>): SkillConfig {
  return {
    name: 'pipeline-wirer',
    description: 'Connect an existing data pipeline to an existing component',
    systemPrompt: (ctx) => `You are a pipeline wiring specialist. Your job is to connect data pipelines to components.

${PIPELINE_COMPONENT_WIRING}

## Process
1. Read the pipeline manifest to understand what data it provides
2. Read the component manifest to understand what data it needs
3. Update the component's code to use bridge.pipeline() or bridge.pipelineSubscribe()
4. Update the component's manifest to declare the pipeline dependency
5. Write the updated component

## Active Components
${ctx.activeComponents.map((c) => `- ${c.componentId}`).join('\n') || 'None'}

## Available Pipelines
Read pipelines.json to see what's available, or use scanLocalPipelines to search.
`,
    tools: {
      readPipelineManifest: tools.readPipelineManifest,
      readManifest: tools.readManifest,
      scanLocalPipelines: tools.scanLocalPipelines,
      writeComponent: tools.writeComponent,
    },
    maxSteps: 8,
    temperature: 0.1,
  }
}
```

Note: Adapt the skill structure to match the exact pattern used in `state-wirer.ts`. The above is a starting point — read the actual skill implementation to match its interface.

- [ ] **Step 3: Register in skills/index.ts**

Add to the skill registry:
```typescript
import { createPipelineWirerSkill } from './pipeline-wirer'

// In buildSkillRegistry:
'pipeline-wirer': createPipelineWirerSkill(tools),
```

- [ ] **Step 4: Commit**

```bash
git add src/main/agent/skills/pipeline-wirer.ts src/main/agent/skills/index.ts
git commit -m "feat(agent): add pipeline-wirer skill"
```

---

### Task 10: Run Full Test Suite

- [ ] **Step 1: Run all new tool tests**

Run: `npx vitest run src/main/agent/tools/__tests__/validatePipelineManifest.test.ts src/main/agent/tools/__tests__/readPipelineManifest.test.ts src/main/agent/tools/__tests__/writePipeline.test.ts src/main/agent/tools/__tests__/dryRunPipeline.test.ts src/main/agent/tools/__tests__/scanLocalPipelines.test.ts`
Expected: ALL PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Run existing tests to ensure no regressions**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A src/main/agent/
git commit -m "fix(agent): address test/type issues from pipeline tools suite"
```
