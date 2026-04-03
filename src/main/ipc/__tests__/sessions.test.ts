import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import type { IpcMain } from 'electron'

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
}))

function createMockIpcMain(): IpcMain & { _invoke(channel: string, args: unknown): unknown } {
  const handlers = new Map<string, Function>()
  return {
    handle: (channel: string, handler: Function) => { handlers.set(channel, handler) },
    _invoke: (channel: string, args: unknown) => {
      const handler = handlers.get(channel)
      if (!handler) throw new Error(`No handler for ${channel}`)
      return handler({}, args)
    },
  } as unknown as IpcMain & { _invoke(channel: string, args: unknown): unknown }
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cslate-sessions-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

const { register } = await import('../sessions')

describe('session:create', () => {
  it('creates a session file and returns an id', async () => {
    const ipc = createMockIpcMain()
    register(ipc)
    const result = await ipc._invoke('session:create', { projectDir: tmpDir }) as { sessionId: string }
    expect(typeof result.sessionId).toBe('string')
    expect(result.sessionId.length).toBeGreaterThan(0)
    const sessionsDir = path.join(tmpDir, '.cslate', 'sessions')
    const files = await fs.readdir(sessionsDir)
    expect(files).toContain(`${result.sessionId}.json`)
  })

  it('returns empty sessionId when projectDir is empty', async () => {
    const ipc = createMockIpcMain()
    register(ipc)
    const result = await ipc._invoke('session:create', { projectDir: '' }) as { sessionId: string }
    expect(result.sessionId).toBe('')
  })
})

describe('session:save', () => {
  it('persists messages and links componentId in sidecar', async () => {
    const ipc = createMockIpcMain()
    register(ipc)

    const { sessionId } = await ipc._invoke('session:create', { projectDir: tmpDir }) as { sessionId: string }

    const componentDir = path.join(tmpDir, 'components', 'my_widget')
    await fs.mkdir(componentDir, { recursive: true })

    await ipc._invoke('session:save', {
      projectDir: tmpDir,
      sessionId,
      componentIds: ['my_widget'],
      messages: [
        { role: 'user', content: 'make a widget', timestamp: 1000 },
        { role: 'assistant', content: 'done!', timestamp: 2000 },
      ],
    })

    const sessionFile = path.join(tmpDir, '.cslate', 'sessions', `${sessionId}.json`)
    const saved = JSON.parse(await fs.readFile(sessionFile, 'utf-8'))
    expect(saved.messages).toHaveLength(2)
    expect(saved.componentIds).toContain('my_widget')

    const sidecar = JSON.parse(await fs.readFile(path.join(componentDir, 'session.json'), 'utf-8'))
    expect(sidecar.sessionIds).toContain(sessionId)
  })
})

describe('session:load', () => {
  it('returns messages for a saved session', async () => {
    const ipc = createMockIpcMain()
    register(ipc)

    const { sessionId } = await ipc._invoke('session:create', { projectDir: tmpDir }) as { sessionId: string }
    await ipc._invoke('session:save', {
      projectDir: tmpDir,
      sessionId,
      componentIds: [],
      messages: [{ role: 'user', content: 'hello', timestamp: 1000 }],
    })

    const result = await ipc._invoke('session:load', { projectDir: tmpDir, sessionId }) as { messages: unknown[] }
    expect(result.messages).toHaveLength(1)
    expect((result.messages[0] as { content: string }).content).toBe('hello')
  })

  it('returns empty messages for nonexistent session', async () => {
    const ipc = createMockIpcMain()
    register(ipc)
    const result = await ipc._invoke('session:load', { projectDir: tmpDir, sessionId: 'nonexistent' }) as { messages: unknown[] }
    expect(result.messages).toEqual([])
  })
})

describe('session:list-for-component', () => {
  it('returns session ids for a component', async () => {
    const ipc = createMockIpcMain()
    register(ipc)

    const componentDir = path.join(tmpDir, 'components', 'my_widget')
    await fs.mkdir(componentDir, { recursive: true })

    const { sessionId } = await ipc._invoke('session:create', { projectDir: tmpDir }) as { sessionId: string }
    await ipc._invoke('session:save', {
      projectDir: tmpDir,
      sessionId,
      componentIds: ['my_widget'],
      messages: [],
    })

    const result = await ipc._invoke('session:list-for-component', { projectDir: tmpDir, componentId: 'my_widget' }) as { sessionIds: string[] }
    expect(result.sessionIds).toContain(sessionId)
  })

  it('returns empty array when no sessions exist', async () => {
    const ipc = createMockIpcMain()
    register(ipc)
    const result = await ipc._invoke('session:list-for-component', { projectDir: tmpDir, componentId: 'ghost' }) as { sessionIds: string[] }
    expect(result.sessionIds).toEqual([])
  })
})

describe('component:list-all', () => {
  it('returns all components with manifest and onCanvas flag', async () => {
    const ipc = createMockIpcMain()
    register(ipc)

    const componentDir = path.join(tmpDir, 'components', 'my_widget')
    await fs.mkdir(componentDir, { recursive: true })
    await fs.writeFile(path.join(componentDir, 'manifest.json'), JSON.stringify({
      name: 'My Widget',
      description: 'A widget',
      tags: ['ui'],
      files: [],
      inputs: {},
      outputs: {},
      events: {},
      actions: {},
    }), 'utf-8')

    await fs.writeFile(path.join(tmpDir, 'canvas.json'), JSON.stringify({
      components: [{ componentId: 'my_widget', placement: { x: 0, y: 0, width: 20, height: 20 } }]
    }), 'utf-8')

    const result = await ipc._invoke('component:list-all', { projectDir: tmpDir }) as { components: Array<{ componentId: string; onCanvas: boolean }> }
    expect(result.components).toHaveLength(1)
    expect(result.components[0].componentId).toBe('my_widget')
    expect(result.components[0].onCanvas).toBe(true)
  })

  it('returns empty when no components dir', async () => {
    const ipc = createMockIpcMain()
    register(ipc)
    const result = await ipc._invoke('component:list-all', { projectDir: tmpDir }) as { components: unknown[] }
    expect(result.components).toEqual([])
  })
})

describe('canvas:add-component', () => {
  it('reads bundle + manifest and returns component data with default placement', async () => {
    const ipc = createMockIpcMain()
    register(ipc)

    const componentDir = path.join(tmpDir, 'components', 'my_widget')
    await fs.mkdir(componentDir, { recursive: true })
    const manifest = { name: 'My Widget', description: 'desc', tags: [], files: [], inputs: {}, outputs: {}, events: {}, actions: {} }
    await fs.writeFile(path.join(componentDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')
    await fs.writeFile(path.join(componentDir, 'bundle.js'), 'module.exports = {}', 'utf-8')

    const result = await ipc._invoke('canvas:add-component', { projectDir: tmpDir, componentId: 'my_widget' }) as { success: boolean; componentId: string; bundle: string; placement: unknown; manifest: unknown }
    expect(result.success).toBe(true)
    expect(result.componentId).toBe('my_widget')
    expect(result.bundle).toBe('module.exports = {}')
    expect(result.placement).toBeDefined()
  })
})
