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
    expect(tool.isReadOnly({ manifest: {} })).toBe(true)
    expect(tool.isConcurrencySafe({ manifest: {} })).toBe(true)
  })
})
