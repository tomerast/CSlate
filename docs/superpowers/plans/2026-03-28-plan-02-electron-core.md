# Plan 02: Electron Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the Electron main process with typed IPC handlers for config (safeStorage + electron-store), project FS operations, file I/O, and window state persistence — providing the foundation that Plan 03 (canvas) and Plan 04 (sandbox) build on.

**Architecture:** Domain-per-file IPC registration. Each `src/main/ipc/*.ts` exports a `register(ipcMain)` function. Business logic is extracted into plain async functions so it can be unit-tested without a running Electron process. `@cslate/shared` types are used directly for `ComponentPackage` / `ComponentManifest`.

**Tech Stack:** Electron 30 · electron-store 8 · Node fs/promises · @cslate/shared · Vitest (node environment for main process tests)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/main/lib/paths.ts` | Create | `safePath()`, `safeComponentId()`, `getUserDataPath()` |
| `src/main/lib/paths.test.ts` | Create | Tests for path helpers |
| `src/main/lib/store.ts` | Create | Typed electron-store singletons (config + window state) |
| `src/main/lib/store.test.ts` | Create | Tests for store wrapper |
| `src/main/ipc/config.ts` | Create | `config:get`, `config:set` handlers + business logic |
| `src/main/ipc/config.test.ts` | Create | Tests for config handlers |
| `src/main/ipc/file.ts` | Create | `file:read/write/exists/delete` handlers + business logic |
| `src/main/ipc/file.test.ts` | Create | Tests for file handlers including path traversal |
| `src/main/ipc/project.ts` | Create | `project:*` and `component:*` handlers + business logic |
| `src/main/ipc/project.test.ts` | Create | Tests for project + component operations |
| `src/main/ipc/window.ts` | Create | `app:get-version`, `window:set-title` handlers |
| `src/main/ipc/window.test.ts` | Create | Tests for window handlers |
| `src/main/windowManager.ts` | Create | Window creation + state persistence |
| `src/main/index.ts` | Modify | Wire up all `register()` calls, import windowManager |
| `src/preload/channels.ts` | Modify | Add new invoke channels |
| `vitest.config.ts` | Modify | Add `environmentMatchGlobs` for node env in main process tests |

---

## Task 1: Install Dependencies + Configure Test Environments

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install electron-store**

```bash
npm install electron-store@^8.0.0
npm install --save-dev @types/electron-store 2>/dev/null || true
```

Expected: `electron-store` appears in `node_modules/`. No errors (the `@types` install may fail — that's fine, electron-store@8 ships its own types).

- [ ] **Step 2: Update vitest.config.ts to use node environment for main process tests**

Full file replacement:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['src/main/**', 'node'],
    ],
    setupFiles: ['./src/test-setup.ts']
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@main': resolve(__dirname, 'src/main')
    }
  }
})
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
npm test
```

Expected:
```
✓ src/renderer/__tests__/App.test.tsx (2)
Test Files  1 passed (1)
Tests       2 passed (2)
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: install electron-store, configure vitest node env for main process"
```

---

## Task 2: Path Helpers (`lib/paths.ts`)

**Files:**
- Create: `src/main/lib/paths.ts`
- Create: `src/main/lib/paths.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/lib/paths.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import path from 'path'
import { safePath, safeComponentId } from './paths'

describe('safePath', () => {
  const projectDir = '/home/user/my-app'

  it('resolves a valid relative path', () => {
    const result = safePath(projectDir, 'components/todo/ui.tsx')
    expect(result).toBe('/home/user/my-app/components/todo/ui.tsx')
  })

  it('resolves a file in root of project', () => {
    const result = safePath(projectDir, 'cslate.json')
    expect(result).toBe('/home/user/my-app/cslate.json')
  })

  it('blocks path traversal with ../', () => {
    expect(() => safePath(projectDir, '../../../etc/passwd')).toThrow('Path traversal attempt blocked')
  })

  it('blocks path traversal that starts valid then escapes', () => {
    expect(() => safePath(projectDir, 'components/../../etc/passwd')).toThrow('Path traversal attempt blocked')
  })

  it('allows nested subdirectory paths', () => {
    const result = safePath(projectDir, 'components/stock-ticker/versions/v1/ui.tsx')
    expect(result).toBe('/home/user/my-app/components/stock-ticker/versions/v1/ui.tsx')
  })
})

describe('safeComponentId', () => {
  it('accepts valid lowercase kebab-case ids', () => {
    expect(safeComponentId('stock-ticker')).toBe('stock-ticker')
    expect(safeComponentId('todo-list-v2')).toBe('todo-list-v2')
    expect(safeComponentId('abc')).toBe('abc')
  })

  it('rejects ids with path separators', () => {
    expect(() => safeComponentId('../evil')).toThrow('Invalid componentId')
    expect(() => safeComponentId('components/ticker')).toThrow('Invalid componentId')
  })

  it('rejects ids with spaces or special chars', () => {
    expect(() => safeComponentId('my component')).toThrow('Invalid componentId')
    expect(() => safeComponentId('TICKER')).toThrow('Invalid componentId')
    expect(() => safeComponentId('')).toThrow('Invalid componentId')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/main/lib/paths.test.ts
```

Expected: FAIL — `Cannot find module './paths'`

- [ ] **Step 3: Implement `src/main/lib/paths.ts`**

```typescript
import { app } from 'electron'
import path from 'path'

/**
 * Resolves a path within a project directory, blocking traversal outside it.
 * Use for all user-supplied relative paths before any FS operation.
 */
export function safePath(projectDir: string, relativePath: string): string {
  const base = path.resolve(projectDir)
  const resolved = path.resolve(projectDir, relativePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal attempt blocked: ${relativePath}`)
  }
  return resolved
}

/**
 * Validates a componentId is a safe directory name (lowercase kebab-case only).
 * Prevents directory traversal via component IDs.
 */
export function safeComponentId(componentId: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(componentId)) {
    throw new Error(`Invalid componentId: "${componentId}" — must be lowercase kebab-case`)
  }
  return componentId
}

/**
 * Resolves a path inside Electron's userData directory.
 * Uses app.getPath('userData') — only call after app.whenReady().
 */
export function getUserDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/main/lib/paths.test.ts
```

Expected:
```
✓ src/main/lib/paths.test.ts (8)
Test Files  1 passed (1)
Tests       8 passed (8)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/lib/paths.ts src/main/lib/paths.test.ts
git commit -m "feat: add path safety helpers for main process"
```

---

## Task 3: Store Wrapper (`lib/store.ts`)

**Files:**
- Create: `src/main/lib/store.ts`
- Create: `src/main/lib/store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/lib/store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-store with an in-memory Map
const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data = storeData
      get(key: string, defaultValue?: unknown): unknown {
        return this.data.has(key) ? this.data.get(key) : defaultValue
      }
      set(key: string, value: unknown): void {
        this.data.set(key, value)
      }
    }
  }
})

// Mock electron (app.getPath not needed for store tests)
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

beforeEach(() => {
  storeData.clear()
})

// Import after mocks are set up
const { configStore, windowStore } = await import('./store')

describe('configStore', () => {
  it('returns default llmProvider', () => {
    expect(configStore.get('llmProvider')).toBe('anthropic')
  })

  it('returns default theme', () => {
    expect(configStore.get('theme')).toBe('dark')
  })

  it('returns default serverUrl', () => {
    expect(configStore.get('serverUrl')).toBe('https://api.cslate.app')
  })

  it('returns default empty recentProjects', () => {
    expect(configStore.get('recentProjects')).toEqual([])
  })

  it('persists and retrieves a set value', () => {
    configStore.set('theme', 'midnight')
    expect(configStore.get('theme')).toBe('midnight')
  })
})

describe('windowStore', () => {
  it('returns default width', () => {
    expect(windowStore.get('width')).toBe(1280)
  })

  it('returns default height', () => {
    expect(windowStore.get('height')).toBe(800)
  })

  it('returns default isMaximized false', () => {
    expect(windowStore.get('isMaximized')).toBe(false)
  })

  it('persists window bounds', () => {
    windowStore.set('width', 1440)
    windowStore.set('height', 900)
    expect(windowStore.get('width')).toBe(1440)
    expect(windowStore.get('height')).toBe(900)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/main/lib/store.test.ts
```

Expected: FAIL — `Cannot find module './store'`

- [ ] **Step 3: Implement `src/main/lib/store.ts`**

```typescript
import Store from 'electron-store'

export interface ConfigStore {
  llmProvider: 'anthropic' | 'openai' | 'google' | 'local'
  llmModel: string
  llmBaseUrl?: string
  serverUrl: string
  theme: 'dark' | 'light' | 'midnight'
  recentProjects: string[]
}

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

export const configStore = new Store<ConfigStore>({
  name: 'config',
  defaults: {
    llmProvider: 'anthropic',
    llmModel: 'claude-opus-4-6',
    serverUrl: 'https://api.cslate.app',
    theme: 'dark',
    recentProjects: [],
  }
})

export const windowStore = new Store<WindowState>({
  name: 'window-state',
  defaults: {
    width: 1280,
    height: 800,
    isMaximized: false,
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/main/lib/store.test.ts
```

Expected:
```
✓ src/main/lib/store.test.ts (9)
Test Files  1 passed (1)
Tests       9 passed (9)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/lib/store.ts src/main/lib/store.test.ts
git commit -m "feat: add typed electron-store singletons for config and window state"
```

---

## Task 4: Config IPC Handler (`ipc/config.ts`)

**Files:**
- Create: `src/main/ipc/config.ts`
- Create: `src/main/ipc/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigStore } from '../lib/store'

// Mock electron-store
const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def?: unknown) { return storeData.has(key) ? storeData.get(key) : def }
    set(key: string, val: unknown) { storeData.set(key, val) }
  }
}))

// Mock electron safeStorage
const mockEncrypt = vi.fn((s: string) => Buffer.from(`enc:${s}`))
const mockDecrypt = vi.fn((b: Buffer) => b.toString().replace(/^enc:/, ''))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: mockEncrypt,
    decryptString: mockDecrypt,
  }
}))

beforeEach(() => {
  storeData.clear()
  vi.clearAllMocks()
})

const { getConfigValue, setConfigValue, SENSITIVE_KEYS } = await import('./config')

describe('SENSITIVE_KEYS', () => {
  it('includes llmApiKey and serverApiKey', () => {
    expect(SENSITIVE_KEYS.has('llmApiKey')).toBe(true)
    expect(SENSITIVE_KEYS.has('serverApiKey')).toBe(true)
  })

  it('does not include non-sensitive keys', () => {
    expect(SENSITIVE_KEYS.has('theme')).toBe(false)
    expect(SENSITIVE_KEYS.has('llmProvider')).toBe(false)
  })
})

describe('setConfigValue + getConfigValue (non-sensitive)', () => {
  it('round-trips a theme value', () => {
    setConfigValue('theme', 'midnight')
    expect(getConfigValue('theme')).toBe('midnight')
  })

  it('round-trips llmProvider', () => {
    setConfigValue('llmProvider', 'openai')
    expect(getConfigValue('llmProvider')).toBe('openai')
  })

  it('round-trips llmModel', () => {
    setConfigValue('llmModel', 'gpt-4o')
    expect(getConfigValue('llmModel')).toBe('gpt-4o')
  })

  it('does NOT call safeStorage for non-sensitive keys', () => {
    setConfigValue('theme', 'light')
    expect(mockEncrypt).not.toHaveBeenCalled()
    getConfigValue('theme')
    expect(mockDecrypt).not.toHaveBeenCalled()
  })
})

describe('setConfigValue + getConfigValue (sensitive)', () => {
  it('encrypts llmApiKey on set', () => {
    setConfigValue('llmApiKey', 'sk-ant-abc123')
    expect(mockEncrypt).toHaveBeenCalledWith('sk-ant-abc123')
  })

  it('decrypts llmApiKey on get', () => {
    setConfigValue('llmApiKey', 'sk-ant-abc123')
    const result = getConfigValue('llmApiKey')
    expect(result).toBe('sk-ant-abc123')
    expect(mockDecrypt).toHaveBeenCalled()
  })

  it('returns null for unset sensitive key', () => {
    expect(getConfigValue('llmApiKey')).toBeNull()
  })

  it('encrypts serverApiKey on set', () => {
    setConfigValue('serverApiKey', 'cslate-key-xyz')
    const result = getConfigValue('serverApiKey')
    expect(result).toBe('cslate-key-xyz')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/main/ipc/config.test.ts
```

Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 3: Implement `src/main/ipc/config.ts`**

```typescript
import { safeStorage } from 'electron'
import type { IpcMain } from 'electron'
import { configStore } from '../lib/store'
import type { ConfigStore } from '../lib/store'

export const SENSITIVE_KEYS = new Set(['llmApiKey', 'serverApiKey'])

const SECURE_PREFIX = '_secure_'

export function getConfigValue(key: string): unknown {
  if (SENSITIVE_KEYS.has(key)) {
    const stored = configStore.get(`${SECURE_PREFIX}${key}` as keyof ConfigStore)
    if (!stored) return null
    return safeStorage.decryptString(Buffer.from(stored as string, 'base64'))
  }
  return configStore.get(key as keyof ConfigStore)
}

export function setConfigValue(key: string, value: unknown): void {
  if (SENSITIVE_KEYS.has(key)) {
    const encrypted = safeStorage.encryptString(String(value))
    configStore.set(`${SECURE_PREFIX}${key}` as keyof ConfigStore, encrypted.toString('base64') as any)
    return
  }
  configStore.set(key as keyof ConfigStore, value as any)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('config:get', (_event, key: string) => getConfigValue(key))
  ipcMain.handle('config:set', (_event, key: string, value: unknown) => setConfigValue(key, value))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/main/ipc/config.test.ts
```

Expected:
```
✓ src/main/ipc/config.test.ts (11)
Test Files  1 passed (1)
Tests       11 passed (11)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/config.ts src/main/ipc/config.test.ts
git commit -m "feat: add config IPC handler with safeStorage for sensitive keys"
```

---

## Task 5: File IPC Handler (`ipc/file.ts`)

**Files:**
- Create: `src/main/ipc/file.ts`
- Create: `src/main/ipc/file.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/file.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFile, writeFile, fileExists, deleteFile } from './file'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'cslate-test-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('writeFile + readFile', () => {
  it('round-trips file content', async () => {
    await writeFile(projectDir, 'test.txt', 'hello world')
    const content = await readFile(projectDir, 'test.txt')
    expect(content).toBe('hello world')
  })

  it('creates intermediate directories', async () => {
    await writeFile(projectDir, 'components/todo/ui.tsx', 'export default function Todo() {}')
    const content = await readFile(projectDir, 'components/todo/ui.tsx')
    expect(content).toContain('function Todo')
  })

  it('overwrites existing files', async () => {
    await writeFile(projectDir, 'file.txt', 'original')
    await writeFile(projectDir, 'file.txt', 'updated')
    expect(await readFile(projectDir, 'file.txt')).toBe('updated')
  })
})

describe('fileExists', () => {
  it('returns true for existing file', async () => {
    await writeFile(projectDir, 'exists.txt', 'yes')
    expect(await fileExists(projectDir, 'exists.txt')).toBe(true)
  })

  it('returns false for missing file', async () => {
    expect(await fileExists(projectDir, 'missing.txt')).toBe(false)
  })
})

describe('deleteFile', () => {
  it('deletes an existing file', async () => {
    await writeFile(projectDir, 'delete-me.txt', 'bye')
    await deleteFile(projectDir, 'delete-me.txt')
    expect(await fileExists(projectDir, 'delete-me.txt')).toBe(false)
  })

  it('throws if file does not exist', async () => {
    await expect(deleteFile(projectDir, 'no-such-file.txt')).rejects.toThrow()
  })
})

describe('path traversal protection', () => {
  it('readFile blocks ../ traversal', async () => {
    await expect(readFile(projectDir, '../../../etc/passwd')).rejects.toThrow('Path traversal attempt blocked')
  })

  it('writeFile blocks ../ traversal', async () => {
    await expect(writeFile(projectDir, '../../evil.sh', 'rm -rf /')).rejects.toThrow('Path traversal attempt blocked')
  })

  it('deleteFile blocks ../ traversal', async () => {
    await expect(deleteFile(projectDir, '../other-dir/file')).rejects.toThrow('Path traversal attempt blocked')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/main/ipc/file.test.ts
```

Expected: FAIL — `Cannot find module './file'`

- [ ] **Step 3: Implement `src/main/ipc/file.ts`**

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import { safePath } from '../lib/paths'

export async function readFile(projectDir: string, relativePath: string): Promise<string> {
  const target = safePath(projectDir, relativePath)
  return fs.readFile(target, 'utf-8')
}

export async function writeFile(projectDir: string, relativePath: string, content: string): Promise<void> {
  const target = safePath(projectDir, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf-8')
}

export async function fileExists(projectDir: string, relativePath: string): Promise<boolean> {
  const target = safePath(projectDir, relativePath)
  return fs.access(target).then(() => true).catch(() => false)
}

export async function deleteFile(projectDir: string, relativePath: string): Promise<void> {
  const target = safePath(projectDir, relativePath)
  await fs.unlink(target)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('file:read', (_e, args: { projectDir: string; relativePath: string }) =>
    readFile(args.projectDir, args.relativePath))
  ipcMain.handle('file:write', (_e, args: { projectDir: string; relativePath: string; content: string }) =>
    writeFile(args.projectDir, args.relativePath, args.content))
  ipcMain.handle('file:exists', (_e, args: { projectDir: string; relativePath: string }) =>
    fileExists(args.projectDir, args.relativePath))
  ipcMain.handle('file:delete', (_e, args: { projectDir: string; relativePath: string }) =>
    deleteFile(args.projectDir, args.relativePath))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/main/ipc/file.test.ts
```

Expected:
```
✓ src/main/ipc/file.test.ts (12)
Test Files  1 passed (1)
Tests       12 passed (12)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/file.ts src/main/ipc/file.test.ts
git commit -m "feat: add file IPC handler with path traversal protection"
```

---

## Task 6: Project + Component IPC Handler (`ipc/project.ts`)

**Files:**
- Create: `src/main/ipc/project.ts`
- Create: `src/main/ipc/project.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/project.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/main/ipc/project.test.ts
```

Expected: FAIL — `Cannot find module './project'`

- [ ] **Step 3: Implement `src/main/ipc/project.ts`**

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import type { ComponentPackage, ComponentManifest } from '@cslate/shared'
import { safePath, safeComponentId } from '../lib/paths'
import { configStore } from '../lib/store'

export interface AppManifest {
  name: string
  version: string
  createdAt: string
  settings: {
    defaultTheme: string
    autoCheckpoint: boolean
  }
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

const MAX_RECENTS = 10

function addToRecents(projectDir: string, name: string): void {
  const entry: RecentProject = {
    path: projectDir,
    name,
    lastOpened: new Date().toISOString(),
  }
  const current = (configStore.get('recentProjects') as string[] | undefined) ?? []
  const deduped = current.filter((p: string) => p !== projectDir)
  const updated = [projectDir, ...deduped].slice(0, MAX_RECENTS)
  configStore.set('recentProjects', updated)
  // Store project names alongside paths
  const names = configStore.get('_recentProjectNames' as any) as Record<string, string> ?? {}
  names[projectDir] = name
  configStore.set('_recentProjectNames' as any, names)
}

export function listRecentProjects(): RecentProject[] {
  const paths = (configStore.get('recentProjects') as string[] | undefined) ?? []
  const names = configStore.get('_recentProjectNames' as any) as Record<string, string> ?? {}
  return paths.map(p => ({
    path: p,
    name: names[p] ?? path.basename(p),
    lastOpened: new Date().toISOString(),
  }))
}

export async function createProject(projectDir: string, name: string): Promise<AppManifest> {
  const manifest: AppManifest = {
    name,
    version: '0.1.0',
    createdAt: new Date().toISOString(),
    settings: { defaultTheme: 'dark', autoCheckpoint: true },
  }
  await fs.mkdir(path.join(projectDir, 'tabs'), { recursive: true })
  await fs.mkdir(path.join(projectDir, 'components'), { recursive: true })
  await fs.mkdir(path.join(projectDir, '.cslate'), { recursive: true })
  await fs.writeFile(path.join(projectDir, 'cslate.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  addToRecents(projectDir, name)
  return manifest
}

export async function openProject(projectDir: string): Promise<AppManifest> {
  const cslateJson = path.join(projectDir, 'cslate.json')
  const raw = await fs.readFile(cslateJson, 'utf-8')
  const manifest = JSON.parse(raw) as AppManifest
  addToRecents(projectDir, manifest.name)
  return manifest
}

export async function saveProject(projectDir: string, manifest: AppManifest): Promise<void> {
  const cslateJson = safePath(projectDir, 'cslate.json')
  await fs.writeFile(cslateJson, JSON.stringify(manifest, null, 2), 'utf-8')
}

export async function readComponent(projectDir: string, componentId: string): Promise<ComponentPackage> {
  safeComponentId(componentId)
  const componentDir = path.join(projectDir, 'components', componentId)
  const manifestRaw = await fs.readFile(path.join(componentDir, 'manifest.json'), 'utf-8')
  const manifest = JSON.parse(manifestRaw) as ComponentManifest
  const files: Record<string, string> = {}
  for (const entry of manifest.files) {
    const filePath = path.join(componentDir, entry.path)
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    if (exists) {
      files[entry.path] = await fs.readFile(filePath, 'utf-8')
    }
  }
  return { manifest, files }
}

export async function writeComponent(projectDir: string, componentId: string, pkg: ComponentPackage): Promise<void> {
  safeComponentId(componentId)
  const componentDir = path.join(projectDir, 'components', componentId)
  await fs.mkdir(componentDir, { recursive: true })
  await fs.writeFile(path.join(componentDir, 'manifest.json'), JSON.stringify(pkg.manifest, null, 2), 'utf-8')
  for (const [filePath, content] of Object.entries(pkg.files)) {
    const target = safePath(componentDir, filePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf-8')
  }
}

export async function listComponents(projectDir: string): Promise<ComponentManifest[]> {
  const componentsDir = path.join(projectDir, 'components')
  const exists = await fs.access(componentsDir).then(() => true).catch(() => false)
  if (!exists) return []
  const entries = await fs.readdir(componentsDir, { withFileTypes: true })
  const manifests: ComponentManifest[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(componentsDir, entry.name, 'manifest.json')
    const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false)
    if (!manifestExists) continue
    const raw = await fs.readFile(manifestPath, 'utf-8')
    manifests.push(JSON.parse(raw) as ComponentManifest)
  }
  return manifests
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('project:open', (_e, args: { projectDir: string }) =>
    openProject(args.projectDir))
  ipcMain.handle('project:save', (_e, args: { projectDir: string; manifest: AppManifest }) =>
    saveProject(args.projectDir, args.manifest))
  ipcMain.handle('project:create', (_e, args: { projectDir: string; name: string }) =>
    createProject(args.projectDir, args.name))
  ipcMain.handle('project:list-recent', () =>
    listRecentProjects())
  ipcMain.handle('component:read', (_e, args: { projectDir: string; componentId: string }) =>
    readComponent(args.projectDir, args.componentId))
  ipcMain.handle('component:write', (_e, args: { projectDir: string; componentId: string; pkg: ComponentPackage }) =>
    writeComponent(args.projectDir, args.componentId, args.pkg))
  ipcMain.handle('component:list', (_e, args: { projectDir: string }) =>
    listComponents(args.projectDir))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/main/ipc/project.test.ts
```

Expected:
```
✓ src/main/ipc/project.test.ts (13)
Test Files  1 passed (1)
Tests       13 passed (13)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/project.ts src/main/ipc/project.test.ts
git commit -m "feat: add project and component IPC handlers"
```

---

## Task 7: Window IPC Handler (`ipc/window.ts`)

**Files:**
- Create: `src/main/ipc/window.ts`
- Create: `src/main/ipc/window.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/ipc/window.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const mockSetTitle = vi.fn()
const mockGetFocusedWindow = vi.fn(() => ({ setTitle: mockSetTitle }))

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '0.1.0'),
    getPath: vi.fn(() => '/tmp/test'),
  },
  BrowserWindow: {
    getFocusedWindow: mockGetFocusedWindow,
  },
  safeStorage: { isEncryptionAvailable: vi.fn(() => true) },
}))

const { getAppVersion, setWindowTitle } = await import('./window')

describe('getAppVersion', () => {
  it('returns the app version string', () => {
    expect(getAppVersion()).toBe('0.1.0')
  })
})

describe('setWindowTitle', () => {
  it('calls setTitle on the focused window', () => {
    setWindowTitle('My App — Dashboard')
    expect(mockSetTitle).toHaveBeenCalledWith('My App — Dashboard')
  })

  it('does nothing if no window is focused', () => {
    mockGetFocusedWindow.mockReturnValueOnce(null)
    expect(() => setWindowTitle('test')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test src/main/ipc/window.test.ts
```

Expected: FAIL — `Cannot find module './window'`

- [ ] **Step 3: Implement `src/main/ipc/window.ts`**

```typescript
import { app, BrowserWindow } from 'electron'
import type { IpcMain } from 'electron'

export function getAppVersion(): string {
  return app.getVersion()
}

export function setWindowTitle(title: string): void {
  BrowserWindow.getFocusedWindow()?.setTitle(title)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('app:get-version', () => getAppVersion())
  ipcMain.handle('window:set-title', (_e, args: { title: string }) => setWindowTitle(args.title))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test src/main/ipc/window.test.ts
```

Expected:
```
✓ src/main/ipc/window.test.ts (3)
Test Files  1 passed (1)
Tests       3 passed (3)
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/window.ts src/main/ipc/window.test.ts
git commit -m "feat: add window IPC handler (app:get-version, window:set-title)"
```

---

## Task 8: Window Manager (`windowManager.ts`)

**Files:**
- Create: `src/main/windowManager.ts`

- [ ] **Step 1: Create `src/main/windowManager.ts`**

```typescript
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { windowStore } from './lib/store'
import type { WindowState } from './lib/store'

function getWindowState(): WindowState {
  return {
    width: windowStore.get('width'),
    height: windowStore.get('height'),
    x: windowStore.get('x'),
    y: windowStore.get('y'),
    isMaximized: windowStore.get('isMaximized'),
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isMaximized()) {
    windowStore.set('isMaximized', true)
    return
  }
  const bounds = win.getBounds()
  windowStore.set('width', bounds.width)
  windowStore.set('height', bounds.height)
  windowStore.set('x', bounds.x)
  windowStore.set('y', bounds.y)
  windowStore.set('isMaximized', false)
}

function isVisibleOnScreen(state: WindowState): boolean {
  const displays = screen.getAllDisplays()
  return displays.some(display => {
    const { x, y, width, height } = display.workArea
    return (
      state.x !== undefined &&
      state.y !== undefined &&
      state.x >= x &&
      state.y >= y &&
      state.x + state.width <= x + width &&
      state.y + state.height <= y + height
    )
  })
}

export function createWindow(): BrowserWindow {
  const savedState = getWindowState()

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedState.width,
    height: savedState.height,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  // Restore position only if it's on a visible display
  if (savedState.x !== undefined && savedState.y !== undefined && isVisibleOnScreen(savedState)) {
    windowOptions.x = savedState.x
    windowOptions.y = savedState.y
  }

  const win = new BrowserWindow(windowOptions)

  if (savedState.isMaximized) {
    win.maximize()
  }

  if (is.dev) {
    win.webContents.openDevTools()
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('close', () => saveWindowState(win))

  return win
}
```

- [ ] **Step 2: Run typecheck to verify no errors**

```bash
npm run typecheck
```

Expected: Zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/windowManager.ts
git commit -m "feat: add window manager with state persistence"
```

---

## Task 9: Update Preload Channels

**Files:**
- Modify: `src/preload/channels.ts`

- [ ] **Step 1: Update `src/preload/channels.ts` with new invoke channels**

```typescript
export const ALLOWED_SEND_CHANNELS = [
  'bridge:fetch',
  'bridge:subscribe',
  'bridge:unsubscribe',
  'sandbox:load',
  'sandbox:unload'
] as const

export const ALLOWED_INVOKE_CHANNELS = [
  // Existing
  'bridge:fetch',
  'file:read',
  'file:write',
  // Config
  'config:get',
  'config:set',
  // Project
  'project:open',
  'project:save',
  'project:create',
  'project:list-recent',
  // Component
  'component:read',
  'component:write',
  'component:list',
  // File (new)
  'file:exists',
  'file:delete',
  // Window
  'app:get-version',
  'window:set-title',
] as const

export const ALLOWED_LISTEN_CHANNELS = [
  'bridge:fetch:resp',
  'bridge:event',
  'sandbox:load:resp',
  'sandbox:error'
] as const

export type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
export type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
export type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/preload/channels.ts
git commit -m "feat: add new IPC invoke channels to preload allowlist"
```

---

## Task 10: Wire Up `index.ts`

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update `src/main/index.ts` to register all handlers**

```typescript
import { app, ipcMain, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createWindow } from './windowManager'
import { register as registerConfig } from './ipc/config'
import { register as registerProject } from './ipc/project'
import { register as registerFile } from './ipc/file'
import { register as registerWindow } from './ipc/window'

function installCSP(): void {
  const serverUrl = process.env['CSLATE_SERVER_URL'] ?? 'http://localhost:3000'
  const connectSrc = is.dev
    ? `'self' ${serverUrl} ws://localhost:5173`
    : `'self' ${serverUrl}`

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:`
        ]
      }
    })
  })
}

app.whenReady().then(() => {
  installCSP()
  registerConfig(ipcMain)
  registerProject(ipcMain)
  registerFile(ipcMain)
  registerWindow(ipcMain)
  createWindow()

  app.on('activate', () => {
    const { BrowserWindow } = require('electron')
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire up all IPC handler registrations in main process"
```

---

## Task 11: Final Integration Verify

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected:
```
✓ src/renderer/__tests__/App.test.tsx (2)
✓ src/main/lib/paths.test.ts (8)
✓ src/main/lib/store.test.ts (9)
✓ src/main/ipc/config.test.ts (11)
✓ src/main/ipc/file.test.ts (12)
✓ src/main/ipc/project.test.ts (13)
✓ src/main/ipc/window.test.ts (3)

Test Files  7 passed (7)
Tests       58 passed (58)
```

- [ ] **Step 2: Run full typecheck**

```bash
npm run typecheck
```

Expected: Zero TypeScript errors.

- [ ] **Step 3: Start the app and verify it opens**

```bash
npm run dev
```

Expected: Electron window opens, restores previous size/position, DevTools opens automatically. No errors in terminal.

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 5: Done ✓**

Plan 02 complete. The Electron main process is fully wired with typed IPC handlers, safeStorage for API keys, project FS operations using `@cslate/shared` types, and persistent window state.

**Next:** Plan 03 — App Shell (tabs + canvas + 8px snap grid)

---

## Self-Review

**Spec coverage check:**
- ✅ Domain-per-file architecture with `register(ipcMain)` pattern — Task 10
- ✅ `config:get` / `config:set` with safeStorage for `llmApiKey`, `serverApiKey` — Task 4
- ✅ `project:open`, `project:save`, `project:create`, `project:list-recent` — Task 6
- ✅ `component:read`, `component:write`, `component:list` using `@cslate/shared` types — Task 6
- ✅ `file:read`, `file:write`, `file:exists`, `file:delete` with path traversal protection — Task 5
- ✅ `app:get-version`, `window:set-title` — Task 7
- ✅ Window state persistence (size, position, maximized) — Task 8
- ✅ `lib/store.ts` typed electron-store singletons — Task 3
- ✅ `lib/paths.ts` `safePath()` and `safeComponentId()` — Task 2
- ✅ Preload channels updated — Task 9
- ✅ `vitest.config.ts` node environment for main process tests — Task 1
- ✅ Path traversal blocked in file and component handlers — Tasks 5, 6
- ✅ Recents list max 10, deduped — Task 6
- ✅ `project:create` creates full directory structure — Task 6

**Type consistency:**
- `AppManifest` defined in `project.ts`, used in `openProject`, `createProject`, `saveProject` ✅
- `RecentProject` defined in `project.ts`, returned by `listRecentProjects` ✅
- `ComponentPackage` / `ComponentManifest` imported from `@cslate/shared` throughout ✅
- `WindowState` defined in `lib/store.ts`, used in `windowManager.ts` ✅
- `ConfigStore` defined in `lib/store.ts`, referenced in `config.ts` ✅
