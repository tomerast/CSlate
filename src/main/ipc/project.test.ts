import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock electron-store (recents list)
const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def?: unknown) { return storeData.has(key) ? storeData.get(key) : def }
    set(key: string, val: unknown) { storeData.set(key, val) }
  }
}))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  safeStorage: { isEncryptionAvailable: vi.fn(() => true) }
}))

let projectDir: string

beforeEach(async () => {
  storeData.clear()
  projectDir = await mkdtemp(join(tmpdir(), 'cslate-proj-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

const {
  createProject,
  openProject,
  saveProject,
  readComponent,
  writeComponent,
  listComponents,
} = await import('./project')

const minimalManifest = {
  name: 'Stock Ticker',
  description: 'Displays real-time stock prices',
  tags: ['finance'],
  inputs: {},
  outputs: {},
  events: {},
  actions: {},
  files: [{ path: 'ui.tsx', type: 'ui' as const, role: 'Main visual component' }],
  defaultSize: { width: 4, height: 2 },
}

describe('createProject', () => {
  it('creates cslate.json with the given name', async () => {
    const manifest = await createProject(projectDir, 'My App')
    expect(manifest.name).toBe('My App')
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.settings.defaultTheme).toBe('dark')
    expect(manifest.settings.autoCheckpoint).toBe(true)
  })

  it('creates the required directory structure', async () => {
    await createProject(projectDir, 'My App')
    const cslateJson = JSON.parse(await readFile(join(projectDir, 'cslate.json'), 'utf-8'))
    expect(cslateJson.name).toBe('My App')
    // Verify required subdirectories exist
    const { stat } = await import('fs/promises')
    await expect(stat(join(projectDir, 'tabs'))).resolves.toBeTruthy()
    await expect(stat(join(projectDir, 'components'))).resolves.toBeTruthy()
    await expect(stat(join(projectDir, '.cslate'))).resolves.toBeTruthy()
  })

  it('adds project to recents', async () => {
    await createProject(projectDir, 'My App')
    const { listRecentProjects } = await import('./project')
    const recents = listRecentProjects()
    expect(recents.some(r => r.path === projectDir)).toBe(true)
  })
})

describe('openProject', () => {
  it('reads an existing cslate.json', async () => {
    await createProject(projectDir, 'Test App')
    const manifest = await openProject(projectDir)
    expect(manifest.name).toBe('Test App')
  })

  it('throws if cslate.json does not exist', async () => {
    await expect(openProject(projectDir)).rejects.toThrow()
  })

  it('adds project to recents on open', async () => {
    await createProject(projectDir, 'Test App')
    storeData.clear()  // clear recents
    await openProject(projectDir)
    const { listRecentProjects } = await import('./project')
    expect(listRecentProjects().some(r => r.path === projectDir)).toBe(true)
  })

  it('throws on invalid manifest missing required fields', async () => {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(projectDir, 'cslate.json'), JSON.stringify({ name: 'Incomplete' }), 'utf-8')
    await expect(openProject(projectDir)).rejects.toThrow('Invalid cslate.json: missing required fields')
  })

  it('throws on completely malformed JSON', async () => {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(projectDir, 'cslate.json'), 'not valid json', 'utf-8')
    await expect(openProject(projectDir)).rejects.toThrow()
  })
})

describe('listRecentProjects', () => {
  it('filters out stale entries with invalid shape from the store', async () => {
    storeData.set('recentProjects', [
      { path: '/valid/path', name: 'Valid', lastOpened: new Date().toISOString() },
      { path: '/missing-name' },           // missing name + lastOpened
      { name: 'No path', lastOpened: '' }, // missing path
      null,                                // null entry
      42,                                  // non-object
    ])
    const { listRecentProjects } = await import('./project')
    const recents = listRecentProjects()
    expect(recents).toHaveLength(1)
    expect(recents[0].path).toBe('/valid/path')
  })

  it('does not persist malformed entries when adding a new project', async () => {
    storeData.set('recentProjects', [
      { path: '/junk' }, // malformed: missing name + lastOpened
    ])
    await createProject(projectDir, 'Fresh App')
    const { listRecentProjects } = await import('./project')
    const recents = listRecentProjects()
    // only the freshly-created project should appear (malformed entry dropped)
    expect(recents.every(r => typeof r.name === 'string' && typeof r.lastOpened === 'string')).toBe(true)
    expect(recents.some(r => r.path === projectDir)).toBe(true)
    expect(recents.some(r => r.path === '/junk')).toBe(false)
  })
})

describe('saveProject', () => {
  it('updates cslate.json on disk', async () => {
    const created = await createProject(projectDir, 'Original')
    await saveProject(projectDir, { ...created, name: 'Updated' })
    const reopened = await openProject(projectDir)
    expect(reopened.name).toBe('Updated')
  })
})

describe('writeComponent + readComponent', () => {
  it('round-trips a ComponentPackage', async () => {
    const pkg = {
      manifest: minimalManifest,
      files: { 'ui.tsx': 'export default function StockTicker() { return <div /> }' },
    }
    await writeComponent(projectDir, 'stock-ticker', pkg)
    const loaded = await readComponent(projectDir, 'stock-ticker')
    expect(loaded.manifest.name).toBe('Stock Ticker')
    expect(loaded.files['ui.tsx']).toContain('StockTicker')
  })

  it('writes manifest.json as formatted JSON', async () => {
    const pkg = { manifest: minimalManifest, files: { 'ui.tsx': '' } }
    await writeComponent(projectDir, 'stock-ticker', pkg)
    const raw = await readFile(join(projectDir, 'components', 'stock-ticker', 'manifest.json'), 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(JSON.parse(raw).name).toBe('Stock Ticker')
  })

  it('rejects invalid componentId', async () => {
    const pkg = { manifest: minimalManifest, files: {} }
    await expect(writeComponent(projectDir, '../evil', pkg)).rejects.toThrow('Invalid componentId')
  })
})

describe('listComponents', () => {
  it('returns empty array for project with no components', async () => {
    await createProject(projectDir, 'Empty App')
    const manifests = await listComponents(projectDir)
    expect(manifests).toEqual([])
  })

  it('returns manifests for all components', async () => {
    await createProject(projectDir, 'App')
    await writeComponent(projectDir, 'stock-ticker', { manifest: minimalManifest, files: {} })
    await writeComponent(projectDir, 'todo-list', {
      manifest: { ...minimalManifest, name: 'Todo List', description: 'A todo list' },
      files: {},
    })
    const manifests = await listComponents(projectDir)
    expect(manifests).toHaveLength(2)
    expect(manifests.map(m => m.name).sort()).toEqual(['Stock Ticker', 'Todo List'])
  })
})
