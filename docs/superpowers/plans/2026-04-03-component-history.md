# Component History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to browse all locally-created components, restore them to canvas, and resume their full conversation history with the agent.

**Architecture:** Sessions are first-class persisted objects (`{projectDir}/.cslate/sessions/{id}.json`) containing the full message array and linked componentIds. Components reference their sessions via a sidecar file (`components/{id}/session.json`). The renderer creates/saves sessions via IPC; the history panel reads all components + their session metadata to build the library view.

**Tech Stack:** Electron IPC, Node.js `fs/promises`, Zustand, React, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/preload/channels.ts` | Modify | Add 6 new IPC channels |
| `src/main/ipc/sessions.ts` | **Create** | All session + canvas:add-component IPC handlers |
| `src/main/ipc/__tests__/sessions.test.ts` | **Create** | Unit tests for sessions handlers |
| `src/main/index.ts` | Modify | Register sessions handler |
| `src/renderer/store/chatStore.ts` | Modify | Add `activeSessionId`, `activeComponentIds`, session actions |
| `src/renderer/__tests__/chatStore.test.ts` | Modify | Tests for new session fields |
| `src/renderer/chat/useChat.ts` | Modify | Create session on first message; link componentId after writeComponent |
| `src/renderer/hooks/useHistory.ts` | **Create** | Fetch all components + resumeComponent logic |
| `src/renderer/components/component-history-panel/ui.tsx` | **Create** | History panel component |
| `src/renderer/store/appStore.ts` | Modify | Add `historyOpen`, `openHistory`, `closeHistory` |
| `src/renderer/App.tsx` | Modify | Mount panel + Cmd+H shortcut |
| `src/renderer/layout/AppLayout.tsx` | Modify | Toolbar history button |

---

## Task 1: Add IPC channels to channels.ts

**Files:**
- Modify: `src/preload/channels.ts`

- [ ] **Step 1: Add the 6 new channels**

In `src/preload/channels.ts`, add to `ALLOWED_INVOKE_CHANNELS`:

```typescript
export const ALLOWED_INVOKE_CHANNELS = [
  'config:get',
  'config:set',
  'file:read',
  'file:write',
  'file:exists',
  'file:delete',
  'project:open',
  'project:save',
  'project:create',
  'project:list-recent',
  'component:read',
  'component:write',
  'component:list',
  'component:list-all',
  'app:get-version',
  'window:set-title',
  'agent:run',
  'agent:permission-response',
  'server:search',
  'server:publish',
  'server:connect',
  'server:disconnect',
  'shell:openExternal',
  'models:fetch',
  'canvas:load',
  'canvas:add-component',
  'session:create',
  'session:save',
  'session:load',
  'session:list-for-component',
  'pipeline:list',
  'pipeline:get-data',
  'pipeline:start',
  'pipeline:stop',
  'pipeline:status',
] as const
```

- [ ] **Step 2: Run typecheck to verify**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/preload/channels.ts
git commit -m "feat(history): add session and history IPC channels to allowlist"
```

---

## Task 2: Create session IPC handlers

**Files:**
- Create: `src/main/ipc/sessions.ts`
- Create: `src/main/ipc/__tests__/sessions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/__tests__/sessions.test.ts`:

```typescript
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

    // canvas.json with my_widget on canvas
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/main/ipc/__tests__/sessions.test.ts
```

Expected: all tests fail with "Cannot find module '../sessions'"

- [ ] **Step 3: Implement `src/main/ipc/sessions.ts`**

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { IpcMain } from 'electron'
import { safeComponentId } from '../lib/paths'

interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface SessionFile {
  id: string
  createdAt: number
  updatedAt: number
  componentIds: string[]
  messages: SessionMessage[]
}

interface ComponentSidecar {
  sessionIds: string[]
}

interface ComponentEntry {
  componentId: string
  manifest: unknown
  lastEditedAt: number
  onCanvas: boolean
  sessionIds: string[]
}

function sessionsDir(projectDir: string): string {
  return path.join(projectDir, '.cslate', 'sessions')
}

function sessionFile(projectDir: string, sessionId: string): string {
  return path.join(sessionsDir(projectDir), `${sessionId}.json`)
}

function sidecarFile(projectDir: string, componentId: string): string {
  return path.join(projectDir, 'components', componentId, 'session.json')
}

async function readSidecar(projectDir: string, componentId: string): Promise<ComponentSidecar> {
  try {
    const raw = await fs.readFile(sidecarFile(projectDir, componentId), 'utf-8')
    return JSON.parse(raw) as ComponentSidecar
  } catch {
    return { sessionIds: [] }
  }
}

async function writeSidecar(projectDir: string, componentId: string, sidecar: ComponentSidecar): Promise<void> {
  await fs.writeFile(sidecarFile(projectDir, componentId), JSON.stringify(sidecar, null, 2), 'utf-8')
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('session:create', async (_e, { projectDir }: { projectDir: string }) => {
    if (!projectDir) return { sessionId: '' }
    const sessionId = randomUUID()
    const dir = sessionsDir(projectDir)
    await fs.mkdir(dir, { recursive: true })
    const session: SessionFile = {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      componentIds: [],
      messages: [],
    }
    await fs.writeFile(sessionFile(projectDir, sessionId), JSON.stringify(session, null, 2), 'utf-8')
    return { sessionId }
  })

  ipcMain.handle('session:save', async (_e, {
    projectDir,
    sessionId,
    componentIds,
    messages,
  }: {
    projectDir: string
    sessionId: string
    componentIds: string[]
    messages: SessionMessage[]
  }) => {
    if (!projectDir || !sessionId) return { ok: false }
    const dir = sessionsDir(projectDir)
    await fs.mkdir(dir, { recursive: true })

    let existing: Partial<SessionFile> = {}
    try {
      const raw = await fs.readFile(sessionFile(projectDir, sessionId), 'utf-8')
      existing = JSON.parse(raw) as Partial<SessionFile>
    } catch { /* new session */ }

    const session: SessionFile = {
      id: sessionId,
      createdAt: existing.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      componentIds,
      messages,
    }
    await fs.writeFile(sessionFile(projectDir, sessionId), JSON.stringify(session, null, 2), 'utf-8')

    // Update component sidecars
    for (const componentId of componentIds) {
      try {
        safeComponentId(componentId)
        const sidecar = await readSidecar(projectDir, componentId)
        if (!sidecar.sessionIds.includes(sessionId)) {
          sidecar.sessionIds.push(sessionId)
          await writeSidecar(projectDir, componentId, sidecar)
        }
      } catch { /* skip invalid componentIds */ }
    }

    return { ok: true }
  })

  ipcMain.handle('session:load', async (_e, {
    projectDir,
    sessionId,
  }: {
    projectDir: string
    sessionId: string
  }) => {
    if (!projectDir || !sessionId) return { messages: [] }
    try {
      const raw = await fs.readFile(sessionFile(projectDir, sessionId), 'utf-8')
      const session = JSON.parse(raw) as SessionFile
      return { messages: session.messages, componentIds: session.componentIds }
    } catch {
      return { messages: [] }
    }
  })

  ipcMain.handle('session:list-for-component', async (_e, {
    projectDir,
    componentId,
  }: {
    projectDir: string
    componentId: string
  }) => {
    if (!projectDir) return { sessionIds: [] }
    try {
      safeComponentId(componentId)
      const sidecar = await readSidecar(projectDir, componentId)
      return { sessionIds: sidecar.sessionIds }
    } catch {
      return { sessionIds: [] }
    }
  })

  ipcMain.handle('component:list-all', async (_e, { projectDir }: { projectDir: string }) => {
    if (!projectDir) return { components: [] }

    const componentsDir = path.join(projectDir, 'components')
    const exists = await fs.access(componentsDir).then(() => true).catch(() => false)
    if (!exists) return { components: [] }

    // Read canvas.json to know which components are on canvas
    const onCanvasIds = new Set<string>()
    try {
      const canvasRaw = await fs.readFile(path.join(projectDir, 'canvas.json'), 'utf-8')
      const canvas = JSON.parse(canvasRaw) as { components: Array<{ componentId: string }> }
      for (const c of canvas.components ?? []) onCanvasIds.add(c.componentId)
    } catch { /* canvas.json may not exist */ }

    const entries = await fs.readdir(componentsDir, { withFileTypes: true })
    const components: ComponentEntry[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const componentId = entry.name
      const manifestPath = path.join(componentsDir, componentId, 'manifest.json')
      try {
        safeComponentId(componentId)
        const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(manifestRaw)
        const stat = await fs.stat(manifestPath)
        const sidecar = await readSidecar(projectDir, componentId)
        components.push({
          componentId,
          manifest,
          lastEditedAt: stat.mtimeMs,
          onCanvas: onCanvasIds.has(componentId),
          sessionIds: sidecar.sessionIds,
        })
      } catch { /* skip corrupted */ }
    }

    // Sort by most recently edited
    components.sort((a, b) => b.lastEditedAt - a.lastEditedAt)

    return { components }
  })

  ipcMain.handle('canvas:add-component', async (_e, {
    projectDir,
    componentId,
  }: {
    projectDir: string
    componentId: string
  }) => {
    if (!projectDir) return { success: false, error: 'No project' }
    try {
      safeComponentId(componentId)
      const componentDir = path.join(projectDir, 'components', componentId)
      const bundle = await fs.readFile(path.join(componentDir, 'bundle.js'), 'utf-8')
      const manifestRaw = await fs.readFile(path.join(componentDir, 'manifest.json'), 'utf-8')
      const manifest = JSON.parse(manifestRaw)
      const placement = { x: 2, y: 2, width: 40, height: 30 }

      // Add to canvas.json
      const canvasPath = path.join(projectDir, 'canvas.json')
      let canvas: { components: Array<{ componentId: string; placement: unknown }> } = { components: [] }
      try {
        const raw = await fs.readFile(canvasPath, 'utf-8')
        canvas = JSON.parse(raw)
      } catch { /* no canvas.json yet */ }

      // Only add if not already present
      if (!canvas.components.find(c => c.componentId === componentId)) {
        canvas.components.push({ componentId, placement })
        await fs.writeFile(canvasPath, JSON.stringify(canvas, null, 2), 'utf-8')
      }

      return { success: true, componentId, bundle, placement, manifest }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/main/ipc/__tests__/sessions.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/sessions.ts src/main/ipc/__tests__/sessions.test.ts
git commit -m "feat(history): add session and component-list IPC handlers"
```

---

## Task 3: Register sessions handler in main process

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add import and registration**

In `src/main/index.ts`, add after the existing imports:

```typescript
import { register as registerSessions } from './ipc/sessions'
```

And in `app.whenReady().then(...)`, add after `registerPipeline(ipcMain)`:

```typescript
registerSessions(ipcMain)
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(history): register sessions IPC handlers in main process"
```

---

## Task 4: Add session fields to chatStore

**Files:**
- Modify: `src/renderer/store/chatStore.ts`
- Modify: `src/renderer/__tests__/chatStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/renderer/__tests__/chatStore.test.ts`:

```typescript
describe('chatStore session fields', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('starts with null activeSessionId', () => {
    expect(useChatStore.getState().activeSessionId).toBeNull()
  })

  it('starts with empty activeComponentIds', () => {
    expect(useChatStore.getState().activeComponentIds).toEqual([])
  })

  it('setActiveSessionId updates the session id', () => {
    useChatStore.getState().setActiveSessionId('session-123')
    expect(useChatStore.getState().activeSessionId).toBe('session-123')
  })

  it('setActiveComponentIds updates the component ids', () => {
    useChatStore.getState().setActiveComponentIds(['widget_a', 'widget_b'])
    expect(useChatStore.getState().activeComponentIds).toEqual(['widget_a', 'widget_b'])
  })

  it('addActiveComponentId adds without duplicates', () => {
    useChatStore.getState().setActiveComponentIds(['widget_a'])
    useChatStore.getState().addActiveComponentId('widget_a')
    useChatStore.getState().addActiveComponentId('widget_b')
    expect(useChatStore.getState().activeComponentIds).toEqual(['widget_a', 'widget_b'])
  })

  it('reset clears session fields', () => {
    useChatStore.getState().setActiveSessionId('session-123')
    useChatStore.getState().setActiveComponentIds(['widget_a'])
    useChatStore.getState().reset()
    expect(useChatStore.getState().activeSessionId).toBeNull()
    expect(useChatStore.getState().activeComponentIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/renderer/__tests__/chatStore.test.ts
```

Expected: new tests fail with "getState().activeSessionId is not a function" or undefined

- [ ] **Step 3: Update chatStore**

Replace `src/renderer/store/chatStore.ts` with:

```typescript
import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  panelOpen: boolean
  turnCount: number
  publishState: 'hidden' | 'prompting' | 'publishing' | 'published' | 'declined'
  statusLabel: string
  messageQueue: string[]
  activeSessionId: string | null
  activeComponentIds: string[]
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setPanelOpen(v: boolean): void
  incrementTurnCount(): void
  setPublishState(s: ChatState['publishState']): void
  enqueueMessage(msg: string): void
  shiftQueue(): string | undefined
  setActiveSessionId(id: string | null): void
  setActiveComponentIds(ids: string[]): void
  addActiveComponentId(id: string): void
  reset(): void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  panelOpen: false,
  turnCount: 0,
  publishState: 'hidden',
  statusLabel: '',
  messageQueue: [],
  activeSessionId: null,
  activeComponentIds: [],
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  incrementTurnCount: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  setPublishState: (publishState) => set({ publishState }),
  enqueueMessage: (msg) => set((s) => ({ messageQueue: [...s.messageQueue, msg] })),
  shiftQueue: () => {
    const { messageQueue } = get()
    if (messageQueue.length === 0) return undefined
    set({ messageQueue: messageQueue.slice(1) })
    return messageQueue[0]
  },
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveComponentIds: (ids) => set({ activeComponentIds: ids }),
  addActiveComponentId: (id) => set((s) => ({
    activeComponentIds: s.activeComponentIds.includes(id)
      ? s.activeComponentIds
      : [...s.activeComponentIds, id],
  })),
  reset: () => set({
    messages: [],
    status: 'idle',
    panelOpen: false,
    turnCount: 0,
    publishState: 'hidden',
    statusLabel: '',
    messageQueue: [],
    activeSessionId: null,
    activeComponentIds: [],
  }),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/renderer/__tests__/chatStore.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/chatStore.ts src/renderer/__tests__/chatStore.test.ts
git commit -m "feat(history): add activeSessionId and activeComponentIds to chatStore"
```

---

## Task 5: Wire session lifecycle into useChat

**Files:**
- Modify: `src/renderer/chat/useChat.ts`

The changes here:
1. On first user message (when `activeSessionId === null`): create a new session via `session:create` using an empty projectDir (consistent with how the rest of the app works)
2. When `agent:tool-result` fires for `writeComponent`: link the componentId to the current session via `session:save`
3. After agent run completes (in `finally`): save the full conversation to the session

- [ ] **Step 1: Update useChat.ts**

Replace `src/renderer/chat/useChat.ts` with:

```typescript
import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { useCanvasStore, type Placement } from '../store/canvasStore'
import type { BuildingTask } from '../canvas/building/types'

const MAX_HISTORY_MESSAGES = 6
const DEFAULT_BUILDING_PLACEMENT = { x: 2, y: 2, width: 50 }

async function ensureSession(projectDir: string): Promise<string> {
  const { activeSessionId } = useChatStore.getState()
  if (activeSessionId) return activeSessionId
  try {
    const result = await window.electron.invoke('session:create', { projectDir }) as { sessionId: string }
    if (result.sessionId) {
      useChatStore.getState().setActiveSessionId(result.sessionId)
      return result.sessionId
    }
  } catch { /* session persistence unavailable */ }
  return ''
}

async function saveSession(projectDir: string, sessionId: string): Promise<void> {
  if (!sessionId) return
  const { messages, activeComponentIds } = useChatStore.getState()
  try {
    await window.electron.invoke('session:save', {
      projectDir,
      sessionId,
      componentIds: activeComponentIds,
      messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
    })
  } catch { /* non-fatal */ }
}

export function useChat() {
  const { addMessage, setStatus, incrementTurnCount, setPublishState } = useChatStore()

  const submit = useCallback(async (text: string) => {
    if (useChatStore.getState().status === 'generating') {
      useChatStore.getState().enqueueMessage(text)
      return
    }

    const projectDir = ''
    const sessionId = await ensureSession(projectDir)

    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPublishState('hidden')

    const tabId = crypto.randomUUID()
    let streamedContent = ''
    let streamMessageAdded = false

    const offToken = window.electron.on('agent:token', (data: unknown) => {
      const d = data as { delta: string }
      streamedContent += d.delta
      if (!streamMessageAdded) {
        addMessage({ role: 'assistant', content: streamedContent })
        streamMessageAdded = true
      } else {
        useChatStore.setState(s => {
          const messages = [...s.messages]
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: streamedContent }
          }
          return { messages }
        })
      }
    })

    const offBuildStart = window.electron.on('agent:build:start', (data: unknown) => {
      const d = data as { buildId: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().addBuildingCard({
        buildId: tabId,
        phase: 'think',
        tasks: [],
        placement: DEFAULT_BUILDING_PLACEMENT,
      })
    })

    const offBuildPlan = window.electron.on('agent:build:plan', (data: unknown) => {
      const d = data as {
        buildId: string
        componentId: string
        description: string
        tasks: Array<{ file: string; assignment: string }>
      }
      if (d.buildId !== tabId) return
      const tasks: BuildingTask[] = d.tasks.map(t => ({
        file: t.file,
        assignment: t.assignment,
        status: 'pending' as const,
      }))
      useCanvasStore.getState().updateBuildingCard(tabId, {
        phase: 'plan',
        componentName: d.componentId.replace(/_/g, ' '),
        description: d.description,
        tasks,
      })
    })

    const offBuildPartial = window.electron.on('agent:build:partial', (data: unknown) => {
      const d = data as { buildId: string; bundle?: string; source?: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().updateBuildingCard(tabId, {
        partialBundle: d.bundle,
        partialSource: d.source,
      })
    })

    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as {
        tool: string
        result: {
          success?: boolean
          bundle?: string
          files?: Record<string, string>
          manifest?: unknown
          placement?: Placement
          componentId?: string
        }
      }

      if (d.tool === 'renderComponent' && d.result?.success) {
        const { bundle, files, manifest, placement } = d.result
        if (bundle && files && manifest) {
          useCanvasStore.getState().setPreview({ bundle, files, manifest, placement })
          setPublishState('prompting')
        }
      } else if (d.tool === 'writeComponent' && d.result?.success) {
        const { componentId, bundle, placement, manifest } = d.result
        if (componentId && bundle && placement && manifest) {
          useCanvasStore.getState().addComponent({ componentId, bundle, placement, manifest })
          useCanvasStore.getState().clearPreview()
          useCanvasStore.getState().removeBuildingCard(tabId)
          setPublishState('prompting')
          // Link this component to the active session
          useChatStore.getState().addActiveComponentId(componentId)
        }
      }
    })

    const offOrchestratorStatus = window.electron.on('agent:orchestrator:status', (data: unknown) => {
      const d = data as { phase: string; workerId?: number; file?: string; workerCount?: number; status?: string }

      const phaseLabels: Record<string, string> = {
        understand: 'Understanding your request...',
        search: 'Searching for blueprints...',
        plan: 'Planning component...',
        dispatch: `Building ${d.workerCount ?? ''} files in parallel...`,
        worker: d.file ? `Building ${d.file}...` : 'Building...',
        validate: 'Validating component...',
        fix: 'Fixing issues...',
        ship: 'Component ready!',
      }
      useChatStore.setState({ statusLabel: phaseLabels[d.phase] ?? d.phase })

      const phaseMap: Record<string, 'think' | 'plan' | 'build' | 'test' | 'done'> = {
        understand: 'think',
        search: 'think',
        plan: 'plan',
        dispatch: 'build',
        worker: 'build',
        validate: 'test',
        fix: 'test',
        ship: 'done',
      }
      const buildPhase = phaseMap[d.phase]
      if (buildPhase) {
        useCanvasStore.getState().updateBuildingCard(tabId, { phase: buildPhase })
      }

      if (d.phase === 'worker' && d.file) {
        const { buildingCards } = useCanvasStore.getState()
        const card = buildingCards.find(c => c.buildId === tabId)
        if (card) {
          const updatedTasks: BuildingTask[] = card.tasks.map(t =>
            t.file === d.file
              ? { ...t, status: (d.status === 'done' ? 'done' : 'building') as BuildingTask['status'] }
              : t
          )
          useCanvasStore.getState().updateBuildingCard(tabId, { tasks: updatedTasks })
        }
      }
    })

    const offError = window.electron.on('agent:error', (data: unknown) => {
      const d = data as { message: string; code?: string }
      if (d.code === 'UNCONFIGURED_LLM') {
        useAppStore.getState().openConfig('models')
        setStatus('idle')
        addMessage({
          role: 'assistant',
          content: "No AI provider configured — I've opened Settings so you can set one up."
        })
      } else {
        setStatus('error')
        addMessage({ role: 'assistant', content: `Error: ${d.message}` })
      }
      useCanvasStore.getState().removeBuildingCard(tabId)
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir,
        tabId,
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })
      setStatus('idle')
      incrementTurnCount()
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offBuildStart()
      offBuildPlan()
      offBuildPartial()
      offToolResult()
      offOrchestratorStatus()
      offError()
      useChatStore.setState({ statusLabel: '' })
      useCanvasStore.getState().removeBuildingCard(tabId)
      // Save session after each completed turn
      await saveSession(projectDir, sessionId)
      const next = useChatStore.getState().shiftQueue()
      if (next) setTimeout(() => submit(next), 0)
    }
  }, [addMessage, setStatus, incrementTurnCount, setPublishState])

  return { submit }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Run existing useChat tests**

```bash
npm test -- src/renderer/__tests__/useChat.test.ts
```

Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/renderer/chat/useChat.ts
git commit -m "feat(history): create session on first message, save after each turn, link components"
```

---

## Task 6: Create useHistory hook

**Files:**
- Create: `src/renderer/hooks/useHistory.ts`

- [ ] **Step 1: Create `src/renderer/hooks/useHistory.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'
import { useAppStore } from '../store/appStore'

export interface HistoryComponent {
  componentId: string
  manifest: {
    name: string
    description: string
    tags: string[]
  }
  lastEditedAt: number
  onCanvas: boolean
  sessionIds: string[]
}

export function useHistory() {
  const [components, setComponents] = useState<HistoryComponent[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electron.invoke('component:list-all', { projectDir: '' }) as {
        components: HistoryComponent[]
      }
      setComponents(result.components ?? [])
    } catch {
      setComponents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const resumeComponent = useCallback(async (componentId: string) => {
    const projectDir = ''

    // Add to canvas if not already there
    const onCanvas = useCanvasStore.getState().components.some(c => c.componentId === componentId)
    if (!onCanvas) {
      try {
        const result = await window.electron.invoke('canvas:add-component', { projectDir, componentId }) as {
          success: boolean
          componentId: string
          bundle: string
          placement: { x: number; y: number; width: number; height: number }
          manifest: unknown
        }
        if (result.success) {
          useCanvasStore.getState().addComponent({
            componentId: result.componentId,
            bundle: result.bundle,
            placement: result.placement,
            manifest: result.manifest,
          })
        }
      } catch { /* continue even if canvas add fails */ }
    }

    // Load latest session
    try {
      const { sessionIds } = await window.electron.invoke('session:list-for-component', {
        projectDir,
        componentId,
      }) as { sessionIds: string[] }

      if (sessionIds.length > 0) {
        const latestSessionId = sessionIds[sessionIds.length - 1]
        const { messages } = await window.electron.invoke('session:load', {
          projectDir,
          sessionId: latestSessionId,
        }) as { messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> }

        // Hydrate chatStore with the restored session
        useChatStore.setState({
          messages,
          activeSessionId: latestSessionId,
          activeComponentIds: [componentId],
        })
      } else {
        // No prior session — start fresh session linked to this component
        useChatStore.setState({
          messages: [],
          activeSessionId: null,
          activeComponentIds: [componentId],
        })
      }
    } catch { /* non-fatal — chat stays as-is */ }

    // Open chat panel and close history panel
    useChatStore.getState().setPanelOpen(true)
    useAppStore.getState().closeHistory()
  }, [])

  return { components, loading, refresh, resumeComponent }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: error — `closeHistory` doesn't exist on appStore yet (will be fixed in Task 8)

Note: this error is expected at this step. It will be resolved in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useHistory.ts
git commit -m "feat(history): add useHistory hook for component browsing and resume"
```

---

## Task 7: Create ComponentHistoryPanel UI

**Files:**
- Create: `src/renderer/components/component-history-panel/ui.tsx`

- [ ] **Step 1: Create the panel component**

Create `src/renderer/components/component-history-panel/ui.tsx`:

```typescript
import React from 'react'
import { useHistory, type HistoryComponent } from '../../hooks/useHistory'

interface ComponentHistoryPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function ComponentHistoryPanel({ isOpen, onClose }: ComponentHistoryPanelProps): React.ReactElement | null {
  if (!isOpen) return null

  const { components, loading, resumeComponent } = useHistory()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[560px] max-h-[92vh] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text">Component History</h2>
            <p className="text-xs text-muted mt-0.5">All components you've built in this project</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-background/80 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
              Loading components...
            </div>
          )}

          {!loading && components.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted text-sm">No components yet</p>
              <p className="text-muted/50 text-xs mt-1">Components you build will appear here</p>
            </div>
          )}

          {!loading && components.map((comp) => (
            <ComponentCard
              key={comp.componentId}
              component={comp}
              onContinue={() => resumeComponent(comp.componentId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface ComponentCardProps {
  component: HistoryComponent
  onContinue: () => void
}

function ComponentCard({ component, onContinue }: ComponentCardProps) {
  const { manifest, onCanvas, lastEditedAt, sessionIds } = component

  const lastEdited = new Date(lastEditedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border hover:border-border/80 hover:bg-background/40 transition-all">
      {/* Thumbnail placeholder */}
      <div className="w-14 h-14 rounded-md bg-background border border-border flex-shrink-0 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-muted/30">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text truncate">{manifest.name}</span>
          {onCanvas && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full border border-primary/20 flex-shrink-0">
              On canvas
            </span>
          )}
        </div>
        {manifest.description && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{manifest.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {manifest.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-background border border-border rounded text-muted">
              {tag}
            </span>
          ))}
          <span className="text-[10px] text-muted/50 ml-auto flex-shrink-0">
            {lastEdited}{sessionIds.length > 0 ? ` · ${sessionIds.length} session${sessionIds.length !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all shadow-sm shadow-primary/20"
      >
        Continue
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: may have error on `closeHistory` (from useHistory hook calling appStore) — will be resolved in Task 8

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/component-history-panel/ui.tsx
git commit -m "feat(history): add ComponentHistoryPanel UI"
```

---

## Task 8: Wire panel into App and AppLayout

**Files:**
- Modify: `src/renderer/store/appStore.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/layout/AppLayout.tsx`

- [ ] **Step 1: Add historyOpen to appStore**

Replace `src/renderer/store/appStore.ts` with:

```typescript
import { create } from 'zustand'
import type { ConfigTab } from '../components/cslate-config-panel/types'

interface AppState {
  configOpen: boolean
  configFocusTab: ConfigTab | undefined
  historyOpen: boolean
  openConfig: (focusTab?: ConfigTab) => void
  closeConfig: () => void
  openHistory: () => void
  closeHistory: () => void
}

export const useAppStore = create<AppState>((set) => ({
  configOpen: false,
  configFocusTab: undefined,
  historyOpen: false,
  openConfig: (focusTab) => set({ configOpen: true, configFocusTab: focusTab }),
  closeConfig: () => set({ configOpen: false, configFocusTab: undefined }),
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
}))
```

- [ ] **Step 2: Mount panel and add Cmd+H in App.tsx**

In `src/renderer/App.tsx`, add the import after the existing imports:

```typescript
import ComponentHistoryPanel from './components/component-history-panel/ui'
```

Change the `useAppStore` destructure from:
```typescript
const { configOpen, configFocusTab, openConfig, closeConfig } = useAppStore()
```
to:
```typescript
const { configOpen, configFocusTab, openConfig, closeConfig, historyOpen, openHistory, closeHistory } = useAppStore()
```

Add the Cmd+H keyboard handler inside the existing `useEffect` that handles Cmd+,:

```typescript
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        configOpen ? closeConfig() : openConfig()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault()
        historyOpen ? closeHistory() : openHistory()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [configOpen, openConfig, closeConfig, historyOpen, openHistory, closeHistory])
```

Add the panel mount after the existing `<CSlateConfigPanel ... />` block:

```tsx
      <ErrorBoundary>
        <ComponentHistoryPanel
          isOpen={historyOpen}
          onClose={closeHistory}
        />
      </ErrorBoundary>
```

- [ ] **Step 3: Add history toolbar button to AppLayout.tsx**

In `src/renderer/layout/AppLayout.tsx`, add the import:

```typescript
import { useAppStore } from '../store/appStore'
```

At the top of `AppLayout` function body, add:

```typescript
  const openHistory = useAppStore((s) => s.openHistory)
```

In the title bar `<div>` (the `.h-8.flex-shrink-0.app-drag-region.relative` div), add a history button to the left of the existing settings button:

```tsx
        <button
          onClick={openHistory}
          title="Component History (⌘H)"
          className="absolute right-10 top-1/2 -translate-y-1/2 p-1 text-muted/50 hover:text-muted transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <path d="M3.05 11a9 9 0 1 1 .5 4" />
            <path d="M3 16H7V12" />
          </svg>
        </button>
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store/appStore.ts src/renderer/App.tsx src/renderer/layout/AppLayout.tsx
git commit -m "feat(history): wire ComponentHistoryPanel into App with Cmd+H shortcut and toolbar button"
```

---

## Task 9: Smoke test

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Verify Cmd+H opens the history panel**

Press Cmd+H. The "Component History" panel should appear.

- [ ] **Step 3: Verify toolbar button works**

Click the history icon in the top-right title bar. Panel should open/close.

- [ ] **Step 4: Verify session is created on first message**

Type a message. Check that `.cslate/sessions/` directory is created in the project directory. If projectDir is empty, the directory is at `{cwd}/.cslate/sessions/`.

- [ ] **Step 5: Verify components appear in panel**

After building a component, press Cmd+H. The component should appear in the list with its name, description, tags, and last-edited date.

- [ ] **Step 6: Verify "Continue" loads the component and restores chat**

Remove a component from canvas, then press Cmd+H and click "Continue" on it. The component should re-appear on canvas and the chat panel should open with the previous conversation.

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(history): smoke test fixes"
```
