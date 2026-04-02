import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, access } from 'node:fs/promises'
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
    expect(tool.isReadOnly({ pipelineId: 'test', files: {}, manifest: {} })).toBe(false)
    expect(tool.isConcurrencySafe({ pipelineId: 'test', files: {}, manifest: {} })).toBe(false)
  })
})
