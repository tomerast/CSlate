import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { createScanLocalComponentsTool } from '../tools/scanLocalComponents'

const TEST_DIR = join(__dirname, '__scan_test_project__')
const COMP_DIR = join(TEST_DIR, 'components')

beforeEach(() => {
  mkdirSync(join(COMP_DIR, 'kanban_board'), { recursive: true })
  writeFileSync(join(COMP_DIR, 'kanban_board', 'manifest.json'), JSON.stringify({
    name: 'Kanban Board',
    description: 'A drag and drop kanban board with columns and cards',
    tags: ['kanban', 'board', 'drag-drop', 'project-management'],
  }))
  writeFileSync(join(COMP_DIR, 'kanban_board', 'ui.tsx'), 'function Component() { return <div>kanban</div> }')

  mkdirSync(join(COMP_DIR, 'stock_ticker'), { recursive: true })
  writeFileSync(join(COMP_DIR, 'stock_ticker', 'manifest.json'), JSON.stringify({
    name: 'Stock Ticker',
    description: 'Displays real-time stock prices',
    tags: ['finance', 'stock', 'ticker'],
  }))
  writeFileSync(join(COMP_DIR, 'stock_ticker', 'ui.tsx'), 'function Component() { return <div>ticker</div> }')
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('scanLocalComponents', () => {
  it('finds components matching query by tag', async () => {
    const tool = createScanLocalComponentsTool(TEST_DIR)
    const result = await tool.execute!({ query: 'kanban drag drop' }, {} as any)
    const r = result as { matches: any[] }
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.matches[0].componentId).toBe('kanban_board')
  })

  it('returns source files for matches', async () => {
    const tool = createScanLocalComponentsTool(TEST_DIR)
    const result = await tool.execute!({ query: 'kanban' }, {} as any)
    const r = result as { matches: any[] }
    expect(r.matches[0].source['ui.tsx']).toContain('kanban')
  })

  it('returns empty array when no match', async () => {
    const tool = createScanLocalComponentsTool(TEST_DIR)
    const result = await tool.execute!({ query: 'weather forecast rain' }, {} as any)
    const r = result as { matches: any[] }
    expect(r.matches).toHaveLength(0)
  })
})
