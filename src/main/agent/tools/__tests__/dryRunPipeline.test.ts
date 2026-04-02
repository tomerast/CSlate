import { describe, it, expect } from 'vitest'
import { createDryRunPipelineTool } from '../dryRunPipeline'

describe('dryRunPipeline', () => {
  const tool = createDryRunPipelineTool()

  it('executes pipeline code and returns sample output', async () => {
    const files = {
      'pipeline.ts': `export default class {
        async execute(params: Record<string, unknown>) {
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
  }, 30_000)

  it('returns error for failing pipeline', async () => {
    const files = {
      'pipeline.ts': `export default class {
        async execute() { throw new Error('API key invalid') }
      }`,
    }

    const result = await tool.call({ files, params: {} })

    expect(result.data.success).toBe(false)
    expect(result.data.errors?.some((e: string) => e.includes('API key invalid'))).toBe(true)
  }, 30_000)

  it('returns error for syntax errors', async () => {
    const files = {
      'pipeline.ts': `export default {{{`,
    }

    const result = await tool.call({ files, params: {} })

    expect(result.data.success).toBe(false)
  }, 30_000)

  it('is not read-only', () => {
    expect(tool.isReadOnly({ files: {} })).toBe(false)
  })
})
