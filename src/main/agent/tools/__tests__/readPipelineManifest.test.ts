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
    const result = await tool.call({ pipelineId: 'test_pipe' }, { projectDir })
    expect(result.data.manifest).toEqual(manifest)
  })

  it('returns error for nonexistent pipeline', async () => {
    const tool = createReadPipelineManifestTool()
    const result = await tool.call({ pipelineId: 'nonexistent' }, { projectDir })
    expect(result.data.error).toBeDefined()
  })

  it('is read-only and concurrent-safe', () => {
    const tool = createReadPipelineManifestTool()
    expect(tool.isReadOnly({ pipelineId: 'x' })).toBe(true)
    expect(tool.isConcurrencySafe({ pipelineId: 'x' })).toBe(true)
  })
})
