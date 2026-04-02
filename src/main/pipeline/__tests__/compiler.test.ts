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
