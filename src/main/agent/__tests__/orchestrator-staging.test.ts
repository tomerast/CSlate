import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { listStaging, loadStaging, saveStaging } from '../orchestrator/staging'

let projectDir: string | null = null

afterEach(async () => {
  if (projectDir) {
    await rm(projectDir, { recursive: true, force: true })
    projectDir = null
  }
})

describe('orchestrator staging', () => {
  it('persists the exact build plan needed for planned resume', async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'cslate-staging-'))

    await saveStaging(projectDir, {
      componentId: 'stock_ticker',
      buildId: 'tab-1',
      phase: 'planned',
      timestamp: Date.now(),
      messages: [],
      buildResults: [],
      plan: {
        componentId: 'stock_ticker',
        contract: 'type Props = {}',
        tasks: [
          { file: 'ui.tsx', assignment: 'Build the inline card', blueprint: null },
          { file: 'manifest.json', assignment: 'Build the manifest', blueprint: null },
        ],
        pipelines: [],
      },
    })

    const loaded = await loadStaging(projectDir, 'stock_ticker')
    expect(loaded?.plan?.componentId).toBe('stock_ticker')
    expect(loaded?.plan?.contract).toBe('type Props = {}')
    expect(loaded?.plan?.tasks.map((task) => task.file)).toEqual(['ui.tsx', 'manifest.json'])

    const listed = await listStaging(projectDir)
    expect(listed[0]?.plan?.tasks).toHaveLength(2)
  })
})
