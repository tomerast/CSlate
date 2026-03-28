# Plan 02: Electron Core — Design Specification

**Date:** 2026-03-28
**Status:** Approved
**Scope:** IPC handler infrastructure, config (safeStorage + electron-store), project FS operations, file domain, window state persistence

---

## 1. Goal

Wire up the Electron main process with all IPC handlers needed to support Plan 03 (canvas + grid) and Plan 04 (sandbox + component rendering). After this plan:

- LLM API keys and server API keys are stored securely in `safeStorage`
- Non-sensitive settings (provider, model, theme) persist in `electron-store`
- Projects can be opened, created, saved, and listed from recents
- Components can be read and written as `ComponentPackage` objects (from `@cslate/shared`)
- Window size/position persist across restarts
- All IPC is typed end-to-end via the preload channel allowlist

---

## 2. Architecture

### 2.1 Directory Structure

```
src/main/
├── index.ts              app init — calls all register() functions, installCSP(), createWindow()
├── windowManager.ts      window creation + state persistence (no IPC)
├── ipc/
│   ├── config.ts         config:get, config:set (safeStorage + electron-store)
│   ├── project.ts        project:open, project:save, project:create, project:list-recent,
│   │                     component:read, component:write, component:list
│   ├── file.ts           file:read, file:write, file:exists, file:delete
│   └── window.ts         app:get-version, window:set-title
└── lib/
    ├── store.ts          electron-store wrapper (typed, singleton)
    └── paths.ts          userData path helpers, project dir resolution
```

Each `ipc/*.ts` exports a single `register(ipcMain: IpcMain): void` function. `index.ts` calls them all during `app.whenReady()`. No globals, no cross-domain imports.

### 2.2 Pattern: Handler Registration

```typescript
// ipc/config.ts
import { IpcMain } from 'electron'

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('config:get', async (_event, key: string) => { ... })
  ipcMain.handle('config:set', async (_event, key: string, value: unknown) => { ... })
}

// index.ts
import { register as registerConfig } from './ipc/config'
import { register as registerProject } from './ipc/project'
import { register as registerFile } from './ipc/file'
import { register as registerWindow } from './ipc/window'

app.whenReady().then(() => {
  installCSP()
  registerConfig(ipcMain)
  registerProject(ipcMain)
  registerFile(ipcMain)
  registerWindow(ipcMain)
  createWindow()
})
```

---

## 3. Config Domain (`ipc/config.ts`)

### 3.1 Store Shape

Non-sensitive values live in `electron-store` (plaintext JSON in userData):

```typescript
interface ConfigStore {
  llmProvider: 'anthropic' | 'openai' | 'google' | 'local'
  llmModel: string
  llmBaseUrl?: string           // for custom/local providers
  serverUrl: string             // default: 'https://api.cslate.app'
  theme: 'dark' | 'light' | 'midnight'
  recentProjects: string[]      // absolute paths, max 10, newest first
}
```

Sensitive values use `safeStorage` (OS keychain encryption):
- `llmApiKey` — Anthropic / OpenAI / etc. API key
- `serverApiKey` — CSlate server API key (from registration)

### 3.2 Sensitive Key Allowlist

The split between safeStorage and electron-store is a static allowlist in the handler — the renderer never decides where a value is stored:

```typescript
const SENSITIVE_KEYS = new Set(['llmApiKey', 'serverApiKey'])
```

### 3.3 IPC Handlers

| Channel | Payload | Returns |
|---|---|---|
| `config:get` | `key: string` | `unknown` (decrypts if sensitive) |
| `config:set` | `key: string, value: unknown` | `void` (encrypts if sensitive) |

---

## 4. Project Domain (`ipc/project.ts`)

### 4.1 Project Directory Structure

```
my-app/
├── cslate.json              app manifest (name, version, createdAt, settings)
├── tabs/
│   └── home.json            tab layout + component placement
├── components/
│   └── stock-ticker/
│       ├── ui.tsx
│       ├── logic.ts
│       ├── types.ts
│       ├── context.md
│       ├── manifest.json    ComponentManifest (from @cslate/shared)
│       └── versions/        checkpoints
├── theme.json
└── .cslate/
    ├── permissions.json
    └── sync.json
```

### 4.2 Types

```typescript
interface AppManifest {
  name: string
  version: string
  createdAt: string           // ISO datetime
  settings: {
    defaultTheme: string
    autoCheckpoint: boolean
  }
}

interface RecentProject {
  path: string                // absolute path to project dir
  name: string
  lastOpened: string          // ISO datetime
}
```

`ComponentPackage` and `ComponentManifest` are imported from `@cslate/shared`.

### 4.3 IPC Handlers

| Channel | Payload | Returns |
|---|---|---|
| `project:open` | `{ projectDir: string }` | `AppManifest` |
| `project:save` | `{ projectDir: string, manifest: AppManifest }` | `void` |
| `project:create` | `{ projectDir: string, name: string }` | `AppManifest` |
| `project:list-recent` | — | `RecentProject[]` |
| `component:read` | `{ projectDir: string, componentId: string }` | `ComponentPackage` |
| `component:write` | `{ projectDir: string, componentId: string, pkg: ComponentPackage }` | `void` |
| `component:list` | `{ projectDir: string }` | `ComponentManifest[]` |

`project:open` and `project:create` both add the project to the recents list (max 10, deduped by path).

---

## 5. File Domain (`ipc/file.ts`)

Generic FS operations scoped to a project directory. All `relativePath` values are validated to prevent path traversal.

| Channel | Payload | Returns |
|---|---|---|
| `file:read` | `{ projectDir: string, relativePath: string }` | `string` |
| `file:write` | `{ projectDir: string, relativePath: string, content: string }` | `void` |
| `file:exists` | `{ projectDir: string, relativePath: string }` | `boolean` |
| `file:delete` | `{ projectDir: string, relativePath: string }` | `void` |

The same path safety rule applies to `component:read/write` — `componentId` is validated as a plain directory name (no slashes, no `..`).

### Path Safety

```typescript
function safePath(projectDir: string, relativePath: string): string {
  const resolved = path.resolve(projectDir, relativePath)
  if (!resolved.startsWith(path.resolve(projectDir))) {
    throw new Error('Path traversal attempt blocked')
  }
  return resolved
}
```

---

## 6. Window State (`windowManager.ts`)

Persists window size and position across restarts using `electron-store`. No IPC channels — internal to main process only.

```typescript
interface WindowState {
  width: number         // default: 1280
  height: number        // default: 800
  x?: number            // centered on screen if absent
  y?: number
  isMaximized: boolean  // default: false
}
```

On `createWindow()`: load saved state, restore bounds, maximize if `isMaximized`.
On window `close` event: save current bounds and maximized state.

---

## 7. Preload Channel Updates (`src/preload/channels.ts`)

New channels to add to `ALLOWED_INVOKE_CHANNELS`:

```typescript
'project:open',
'project:save',
'project:create',
'project:list-recent',
'component:read',
'component:write',
'component:list',
'file:exists',
'file:delete',
```

(`file:read` and `file:write` are already in the allowlist from Plan 01.)

---

## 8. Dependencies

New packages to install:

| Package | Purpose |
|---|---|
| `electron-store` | Persistent JSON store in userData |

No additional packages — `safeStorage` and `fs/promises` are built into Electron/Node.

### Window Domain (`ipc/window.ts`)

| Channel | Payload | Returns |
|---|---|---|
| `app:get-version` | — | `string` (app version from package.json) |
| `window:set-title` | `{ title: string }` | `void` |

---

## 9. Testing

Each handler is tested by calling the registered function directly (no Electron process needed):

- `config:get` / `config:set`: round-trip for non-sensitive and sensitive keys
- `project:create`: verify directory structure is created, `AppManifest` returned
- `project:open`: read existing `cslate.json`, reject missing project dir
- `component:read` / `component:write`: round-trip `ComponentPackage`, validate with `@cslate/shared`
- `file:read` / `file:write`: round-trip content
- `file:delete`: verify file removed
- Path traversal: `../../../etc/passwd` must throw

---

## 10. What This Unblocks

| Plan | What it needs from Plan 02 |
|---|---|
| Plan 03 (canvas + grid) | `config:get` for theme, `project:open` to load tab layout |
| Plan 04 (sandbox) | `component:read` to load `ComponentPackage` into iframe |
| Plan 05 (AI agent) | `config:get` for LLM API key, `component:write` to save generated components |

---

## 11. File Map

| File | Action |
|---|---|
| `src/main/index.ts` | Modify — add handler registrations |
| `src/main/windowManager.ts` | Create |
| `src/main/ipc/config.ts` | Create |
| `src/main/ipc/project.ts` | Create |
| `src/main/ipc/file.ts` | Create |
| `src/main/ipc/window.ts` | Create |
| `src/main/lib/store.ts` | Create |
| `src/main/lib/paths.ts` | Create |
| `src/preload/channels.ts` | Modify — add new invoke channels |
