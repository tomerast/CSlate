import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createScanLocalPipelinesTool } from '../scanLocalPipelines'

describe('scanLocalPipelines', () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'scan-pipelines-test-'))

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
