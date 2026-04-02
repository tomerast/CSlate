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
