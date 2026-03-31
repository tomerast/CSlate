# Component Sandbox Bundling & Persistent Canvas

**Date:** 2026-03-31
**Status:** Draft
**Repos affected:** `CSlate-shared`, `CSlate` (client)

---

## 1. Goal & Motivation

### The problems

1. **Import resolution fails silently.** `DynamicComponent` uses Babel + `new Function`. When `ui.tsx` imports `./hooks/useData`, Babel compiles it to `require('./hooks/useData')`. `require` doesn't exist in `new Function` scope. The component silently fails. Multi-file components are impossible.

2. **Components don't persist.** `chatStore.currentCode` is in-memory only. Restart the app and every component you built is gone. The canvas shows one component at a time, centered. There is no persistent workspace.

3. **No structural enforcement.** `writeComponent` and `renderComponent` accept open `files` objects with no validation. A prompt-injected agent could attempt `../../package.json` as a filename. Path traversal is blocked at the OS level, but the tool-level allowlist is missing.

### The solution

Three things, treated as one coherent design:

- **Real bundling via esbuild.** Write component files to a temp directory (or the final component directory), let esbuild bundle them using its native module resolution. `DynamicComponent` evaluates the pre-built CJS bundle. Components can have any directory structure: `hooks/`, `components/`, `utils/`, whatever — just like a real TypeScript app.

- **Persistent canvas.** `writeComponent` saves source files AND a pre-built `bundle.js` to `projectDir/components/{id}/`. A `canvas.json` in the project root tracks which components are on the canvas and where. On startup, the app reads `canvas.json`, loads each component's `bundle.js`, and hydrates the canvas. Components live until explicitly deleted.

- **Package validation at the schema level.** `ComponentPackageSchema` in `@cslate/shared` gains minimum-viable validation: `ui.tsx` required (entry point), paths must be safe (no `..`, no absolute, no null bytes). Content is not policed — users can build whatever they want.

---

## 2. Architecture Overview

### Current flow (broken)

```
Agent calls renderComponent({ files: { 'ui.tsx': '...' }, manifest })
  Main process:
    → stripFences(ui.tsx)
    → sender.send('sandbox:load', { files })   ← dead code, nobody listens
    → returns { success, componentId }

  Renderer:
    useChat.ts: agent:tool-call → capture input.files['ui.tsx'] as pendingCode
    useChat.ts: agent:tool-result → setCurrentCode(pendingCode)
    SlateCanvas: reads currentCode from chatStore (in-memory, lost on restart)
    DynamicComponent({ code }):
      → Babel.transform(code, { presets: ['react'] })
      → new Function('React', 'useState', ..., `${transformed}; return Component`)
      → Single file only. No imports. Must name variable `Component`.
      → Restart app → gone.
```

### New flow

```
Agent calls renderComponent({ files, manifest, placement })
  Main process:
    → validateComponentPackage({ manifest, files })
    → stripFences(all files)
    → write files to /tmp/cslate-build-{uuid}/
    → esbuild.build({ entryPoints: [ui.tsx], bundle: true, format: 'cjs' })
    → rm -rf temp dir
    → returns { success, componentId, bundle, files }

  Renderer:
    useChat.ts: agent:tool-result → canvasStore.setPreview({ bundle, files, manifest, placement })
    SlateCanvas: renders preview component at placement coords

Agent calls writeComponent({ componentId, files, manifest, placement })
  Main process:
    → validateComponentPackage({ manifest, files })
    → stripFences(all files)
    → write source files to projectDir/components/{componentId}/
    → esbuild.build from component dir → write bundle.js alongside source
    → update canvas.json with { componentId, placement }
    → returns { success, componentId, bundle, placement, manifest }

  Renderer:
    useChat.ts: agent:tool-result → canvasStore.addComponent({ id, bundle, placement, manifest })
    SlateCanvas: component appears permanently. Survives restart.

App startup:
    Main process:
      → canvas:load IPC → reads canvas.json → for each: reads bundle.js + manifest.json
      → returns [{ componentId, bundle, placement, manifest }]
    Renderer:
      → canvasStore.hydrate(components)
      → SlateCanvas renders all components at their positions
```

---

## 3. Component Directory Structure

```
projectDir/
├── cslate.json                           # app manifest (name, version, settings)
├── canvas.json                           # NEW: which components are on canvas + where
├── components/
│   └── weather-widget/                   # one dir per component
│       ├── manifest.json                 # component contract
│       ├── ui.tsx                        # entry point (required, default export)
│       ├── hooks/
│       │   └── useWeather.ts             # any structure the user wants
│       ├── utils/
│       │   └── format.ts
│       ├── types.ts
│       ├── context.md                    # AI summary (optional)
│       └── bundle.js                     # NEW: pre-built CJS, generated by writeComponent
└── agent/
    └── memory/                           # agent memory (existing)
```

`bundle.js` is a build artifact — regenerated by `writeComponent` whenever source files change. It is the only file `DynamicComponent` needs to render the component. Source files are the source of truth; `bundle.js` can always be rebuilt from them.

---

## 4. Canvas Persistence Model

### `canvas.json`

```json
{
  "components": [
    {
      "componentId": "weather-widget",
      "placement": { "x": 10, "y": 5, "width": 30, "height": 25 }
    },
    {
      "componentId": "stock-ticker",
      "placement": { "x": 45, "y": 5, "width": 25, "height": 20 }
    }
  ]
}
```

- Stored at `projectDir/canvas.json`
- Each entry is a componentId + placement in grid units (1 unit = 8px)
- Order determines z-index (last = on top)
- Written by `writeComponent` tool and delete operations
- Read on startup by `canvas:load` IPC

### Lifecycle

| Event | canvas.json | Component dir | Canvas |
|---|---|---|---|
| `renderComponent` (preview) | No change | No change | Shows preview (ephemeral) |
| `writeComponent` (persist) | Add/update entry | Source + bundle.js written | Component appears permanently |
| App restart | Read on startup | bundle.js loaded | All components restored |
| Delete component | Remove entry | Dir deleted | Component removed |
| Modify component | Update entry | Source + bundle.js rewritten | Component re-rendered |

---

## 5. Part 1 — `@cslate/shared` Changes

**Repo:** `github:tomerast/CSlate-shared`
**Files:** `src/schemas/manifest.ts`, `src/index.ts`

### 5.1 `ComponentPackageSchema.files` — add `superRefine`

Current:
```typescript
export const ComponentPackageSchema = z.object({
  manifest: ComponentManifestSchema,
  files: z.record(z.string()),
})
```

New:
```typescript
export const ComponentPackageSchema = z.object({
  manifest: ComponentManifestSchema,
  files: z.record(z.string()).superRefine((files, ctx) => {
    // Rule 1: ui.tsx is the entry point — required for any component to render
    if (!('ui.tsx' in files)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ui.tsx is required — it is the component entry point',
        path: ['ui.tsx'],
      })
    }

    // Rule 2: path safety — no traversal, no absolute paths, no null bytes
    for (const filePath of Object.keys(files)) {
      if (filePath.includes('..')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Path traversal not allowed: "${filePath}"`,
          path: [filePath],
        })
      }
      if (filePath.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Absolute paths not allowed: "${filePath}"`,
          path: [filePath],
        })
      }
      if (filePath.includes('\0')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Null bytes not allowed in path: "${filePath}"`,
          path: [filePath],
        })
      }
    }
  }),
})
```

**Rationale:** Intentionally minimal. Files are open (`z.record`) — any relative path is allowed. We only enforce the one invariant needed to render (`ui.tsx`) and the security invariants (no traversal). Content is not policed.

### 5.2 `validateComponentPackage()` — new export

```typescript
export type PackageValidationResult =
  | { valid: true; pkg: ComponentPackage }
  | { valid: false; errors: string[] }

export function validateComponentPackage(pkg: unknown): PackageValidationResult {
  const result = ComponentPackageSchema.safeParse(pkg)
  if (result.success) return { valid: true, pkg: result.data }
  const errors = result.error.issues.map(issue => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  })
  return { valid: false, errors }
}
```

### 5.3 Export from `src/index.ts`

```typescript
export { validateComponentPackage } from './schemas/manifest'
export type { PackageValidationResult } from './schemas/manifest'
```

### 5.4 Version bump

`0.1.0` → `0.2.0`. Build, push. CSlate client re-installs via `npm install`.

---

## 6. Part 2 — esbuild Bundler Module

**New file:** `src/main/agent/lib/bundler.ts`

### 6.1 esbuild dependency

Add to `dependencies` (not devDependencies — needed at runtime):

```json
"esbuild": "^0.25.0"
```

esbuild ships native binaries. In a packaged Electron app, add to build config:
```json
"build": {
  "asarUnpack": [
    "**/node_modules/esbuild/**",
    "**/node_modules/@esbuild/**"
  ]
}
```

### 6.2 `bundleComponentFiles()` — temp directory approach

Writes all files to a temp directory, runs esbuild with native filesystem resolution, cleans up. No virtual filesystem plugin, no custom path resolution — esbuild handles extensions, index files, and nested directories natively.

```typescript
// src/main/agent/lib/bundler.ts
import * as esbuild from 'esbuild'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'

/**
 * Bundles component files into a single CJS string via esbuild.
 *
 * Writes files to a temp directory, bundles with esbuild's native resolver,
 * then cleans up. Entry point is always ui.tsx.
 *
 * react and react-dom are externalized — provided by the sandbox require shim.
 */
export async function bundleComponentFiles(
  files: Record<string, string>
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cslate-build-'))
  try {
    // Write all component files to temp dir, preserving directory structure
    await Promise.all(
      Object.entries(files).map(async ([relPath, content]) => {
        const absPath = join(tmpDir, relPath)
        await mkdir(dirname(absPath), { recursive: true })
        await writeFile(absPath, content, 'utf-8')
      })
    )

    const result = await esbuild.build({
      entryPoints: [join(tmpDir, 'ui.tsx')],
      bundle: true,
      format: 'cjs',
      target: 'es2020',
      write: false,
      logLevel: 'silent',
      external: ['react', 'react-dom'],
    })

    if (result.errors.length > 0) {
      throw new Error(result.errors.map(e => e.text).join('\n'))
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
```

### 6.3 `bundleComponentDir()` — bundles from an existing directory on disk

Used by `writeComponent` after writing source files. No temp dir needed — files are already on disk.

```typescript
/**
 * Bundles a component from its persisted directory on disk.
 * Used by writeComponent after source files are written.
 */
export async function bundleComponentDir(componentDir: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [join(componentDir, 'ui.tsx')],
    bundle: true,
    format: 'cjs',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom'],
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors.map(e => e.text).join('\n'))
  }

  return result.outputFiles[0].text
}
```

### 6.4 What esbuild handles natively

No custom code needed for any of these — esbuild's native resolver does it all:

- Extension resolution: `import './useData'` finds `useData.ts`, `useData.tsx`, etc.
- Index files: `import './hooks'` finds `hooks/index.ts`
- Nested directories: any depth
- TypeScript type stripping
- TSX/JSX transformation
- `import type` erasure
- Re-exports: `export { x } from './y'`
- Tree shaking
- Circular dependency detection

### 6.5 What is NOT supported (by design)

- npm package imports other than `react`/`react-dom` — will error at bundle time. Components use `bridge.fetch()` for external data.
- CSS Modules — use Tailwind classes.
- Image/asset imports — reference via bridge.

---

## 7. Part 3 — `renderComponent` Tool Update (Preview)

**File:** `src/main/agent/tools/renderComponent.ts`

`renderComponent` is the **ephemeral preview** tool. It bundles in a temp directory, returns the bundle to the renderer, but does NOT write to disk. The preview disappears on app restart. Use `writeComponent` to persist.

### 7.1 Updated input schema

```typescript
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentFiles } from '../lib/bundler'

const RenderInputSchema = z.object({
  files: z.record(z.string()).describe(
    'Component files keyed by relative path. ui.tsx is required. ' +
    'May include any structure: "hooks/useData.ts", "components/Chart.tsx", etc.'
  ),
  manifest: z.any().describe('The ComponentManifest object'),
  placement: PlacementSchema.optional().describe(
    'Where to place the preview on canvas. Omit to auto-place.'
  ),
})
```

### 7.2 Updated output type

```typescript
type RenderOutput = {
  success: boolean
  componentId: string
  bundle?: string
  files?: Record<string, string>
  errors?: string[]
}
```

### 7.3 Updated `execute()` body

```typescript
execute: async (input: RenderInput): Promise<RenderOutput> => {
  const cleanFiles: Record<string, string> = {}
  for (const [path, content] of Object.entries(input.files)) {
    cleanFiles[path] = stripFences(content)
  }

  const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
  if (!validation.valid) {
    return { success: false, componentId: '', errors: validation.errors }
  }

  let bundle: string
  try {
    bundle = await bundleComponentFiles(cleanFiles)
  } catch (e) {
    return { success: false, componentId: '', errors: [e instanceof Error ? e.message : String(e)] }
  }

  const componentId = `preview_${Date.now()}`
  return { success: true, componentId, bundle, files: cleanFiles }
},
```

Removed: `sender.send('sandbox:load', ...)` — was dead code. Bundle is delivered to the renderer via `agent:tool-result`.

---

## 8. Part 4 — `writeComponent` Tool Update (Persist)

**File:** `src/main/agent/tools/writeComponent.ts`

`writeComponent` is the **persist** tool. It writes source files, bundles them, writes `bundle.js`, and updates `canvas.json`. The component is now permanently on the canvas.

### 8.1 Tool creation — now needs `sender` and `projectDir`

```typescript
export function createWriteComponentTool(
  projectDir: string,
  sender: WebContents,
  tabId: string
): Tool<WriteInput, WriteOutput>
```

### 8.2 Updated input schema

```typescript
const WriteInputSchema = z.object({
  componentId: z.string()
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .describe('lowercase identifier, e.g. "weather_widget" or "stock-ticker"'),
  files: z.record(z.string()).describe(
    'All component files keyed by relative path. ui.tsx is required. ' +
    'Include any structure you need. Include "context.md" as a file.'
  ),
  manifest: z.any().describe('The validated ComponentManifest object'),
  placement: PlacementSchema.optional().describe(
    'Where to place the component on canvas. Omit to auto-place.'
  ),
})
```

### 8.3 Updated `execute()` body

```typescript
execute: async (input: WriteInput): Promise<WriteOutput> => {
  // 1. Path containment
  const componentsRoot = resolve(projectDir, 'components')
  const componentDir = resolve(componentsRoot, input.componentId)
  if (!componentDir.startsWith(componentsRoot + sep)) {
    return { success: false, path: '', errors: ['Invalid componentId: path traversal'] }
  }

  // 2. Strip fences
  const cleanFiles: Record<string, string> = {}
  for (const [filePath, content] of Object.entries(input.files)) {
    cleanFiles[filePath] = stripFences(content)
  }

  // 3. Validate package
  const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
  if (!validation.valid) {
    return { success: false, path: '', errors: validation.errors }
  }

  // 4. Write all source files
  await mkdir(componentDir, { recursive: true })
  await writeFile(join(componentDir, 'manifest.json'), JSON.stringify(input.manifest, null, 2), 'utf-8')

  await Promise.all(
    Object.entries(cleanFiles).map(async ([filePath, content]) => {
      const target = join(componentDir, filePath)
      if (!target.startsWith(componentDir + sep) && target !== join(componentDir, filePath)) {
        throw new Error(`Path traversal in files map: "${filePath}"`)
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf-8')
    })
  )

  // 5. Bundle from the written source files
  let bundle: string
  try {
    bundle = await bundleComponentDir(componentDir)
  } catch (e) {
    return { success: false, path: componentDir, errors: [e instanceof Error ? e.message : String(e)] }
  }

  // 6. Write bundle.js
  await writeFile(join(componentDir, 'bundle.js'), bundle, 'utf-8')

  // 7. Update canvas.json
  const placement = input.placement ?? {
    x: 0, y: 0,
    width: input.manifest?.defaultSize?.width ?? 30,
    height: input.manifest?.defaultSize?.height ?? 25,
  }
  await updateCanvasJson(projectDir, input.componentId, placement)

  return {
    success: true,
    path: componentDir,
    componentId: input.componentId,
    bundle,
    placement,
    manifest: input.manifest,
  }
},
```

### 8.4 Updated output type

```typescript
type WriteOutput = {
  success: boolean
  path: string
  componentId?: string
  bundle?: string
  placement?: { x: number; y: number; width: number; height: number }
  manifest?: unknown
  errors?: string[]
}
```

### 8.5 `updateCanvasJson()` helper

```typescript
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

interface CanvasEntry {
  componentId: string
  placement: { x: number; y: number; width: number; height: number }
}

interface CanvasJson {
  components: CanvasEntry[]
}

async function readCanvasJson(projectDir: string): Promise<CanvasJson> {
  try {
    const raw = await readFile(join(projectDir, 'canvas.json'), 'utf-8')
    return JSON.parse(raw) as CanvasJson
  } catch {
    return { components: [] }
  }
}

async function updateCanvasJson(
  projectDir: string,
  componentId: string,
  placement: { x: number; y: number; width: number; height: number }
): Promise<void> {
  const canvas = await readCanvasJson(projectDir)
  const existing = canvas.components.findIndex(c => c.componentId === componentId)
  if (existing >= 0) {
    canvas.components[existing].placement = placement
  } else {
    canvas.components.push({ componentId, placement })
  }
  await writeFile(join(projectDir, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf-8')
}

async function removeFromCanvasJson(projectDir: string, componentId: string): Promise<void> {
  const canvas = await readCanvasJson(projectDir)
  canvas.components = canvas.components.filter(c => c.componentId !== componentId)
  await writeFile(join(projectDir, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf-8')
}
```

These helpers live in `src/main/agent/lib/canvasJson.ts` (or colocated with writeComponent).

---

## 9. Part 5 — `DynamicComponent` Renderer Update

**File:** `src/renderer/sandbox/DynamicComponent.tsx`

### 9.1 What changes

- Remove `@babel/standalone` entirely
- Accept `bundle: string` prop instead of `code: string`
- Synchronous CJS evaluation with `require` shim
- `require('react')` → injected React, `require('react-dom')` → injected ReactDOM
- Any other `require()` throws a clear error
- Default export (`module.exports.default`) is the component
- No naming constraint — `export default function WeatherApp()` works

### 9.2 Full implementation

```typescript
import React from 'react'
import ReactDOM from 'react-dom'
import { ComponentError } from './ComponentError'

interface Props {
  bundle: string
}

interface EvalResult {
  Component: React.ComponentType | null
  error: string | null
}

function evalBundle(bundle: string): EvalResult {
  try {
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string): unknown => {
      if (mod === 'react') return React
      if (mod === 'react-dom') return ReactDOM
      throw new Error(
        `Module "${mod}" is not available in the CSlate sandbox. ` +
        `Use bridge.fetch() for external data, or inline your logic.`
      )
    }

    // eslint-disable-next-line no-new-func
    const factory = new Function('require', 'module', 'exports', bundle)
    factory(_require, _module, _module.exports)

    const Component = _module.exports['default'] as React.ComponentType | undefined
    if (typeof Component !== 'function') {
      return {
        Component: null,
        error:
          'No default export found. ' +
          'Your ui.tsx must have: export default function MyComponent() { ... }',
      }
    }
    return { Component, error: null }
  } catch (e) {
    return { Component: null, error: `Failed to evaluate: ${String(e)}` }
  }
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError(e: Error): void },
  { caught: boolean }
> {
  state = { caught: false }
  static getDerivedStateFromError() { return { caught: true } }
  componentDidCatch(e: Error) { this.props.onError(e) }
  render() { return this.state.caught ? null : this.props.children }
}

export function DynamicComponent({ bundle }: Props) {
  const [result, setResult] = React.useState<EvalResult>({ Component: null, error: null })
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setRuntimeError(null)
    setResult(evalBundle(bundle))
  }, [bundle])

  if (result.error) return <ComponentError message={result.error} />
  if (runtimeError) return <ComponentError message={`Runtime: ${runtimeError}`} />
  if (!result.Component) return null

  return (
    <ErrorBoundary key={bundle} onError={(e) => setRuntimeError(e.message)}>
      <result.Component />
    </ErrorBoundary>
  )
}
```

### 9.3 Before vs. after

| Aspect | Before (Babel) | After (esbuild CJS) |
|---|---|---|
| Compilation | Lazy, in renderer, per render | Eager, in main process, once |
| Multi-file | No | Yes |
| Component naming | Must be variable `Component` | Any name, must be `export default` |
| Import resolution | Fails silently | Works natively |
| Error messages | Cryptic `ReferenceError: require` | Clear "Module X not available in sandbox" |
| React | Injected as `new Function` params | Via `require('react')` shim |

---

## 10. Part 6 — Canvas Store

**New file:** `src/renderer/store/canvasStore.ts`

Separate from `chatStore`. The canvas store manages persistent components and the ephemeral preview.

### 10.1 Types

```typescript
export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasComponent {
  componentId: string
  bundle: string
  placement: Placement
  manifest: unknown
}

export interface CanvasPreview {
  bundle: string
  files: Record<string, string>
  manifest: unknown
  placement?: Placement
}
```

### 10.2 Store interface and implementation

```typescript
import { create } from 'zustand'

interface CanvasState {
  components: CanvasComponent[]          // persisted, survive restart
  preview: CanvasPreview | null          // ephemeral, from renderComponent

  hydrate(components: CanvasComponent[]): void
  addComponent(comp: CanvasComponent): void
  updateComponent(componentId: string, updates: Partial<CanvasComponent>): void
  removeComponent(componentId: string): void

  setPreview(preview: CanvasPreview): void
  clearPreview(): void
  promotePreview(componentId: string): void  // preview → persisted
}

export const useCanvasStore = create<CanvasState>((set) => ({
  components: [],
  preview: null,

  hydrate: (components) => set({ components }),

  addComponent: (comp) => set((s) => {
    // Replace if same componentId already exists (re-build)
    const filtered = s.components.filter(c => c.componentId !== comp.componentId)
    return { components: [...filtered, comp] }
  }),

  updateComponent: (componentId, updates) => set((s) => ({
    components: s.components.map(c =>
      c.componentId === componentId ? { ...c, ...updates } : c
    ),
  })),

  removeComponent: (componentId) => set((s) => ({
    components: s.components.filter(c => c.componentId !== componentId),
  })),

  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),

  promotePreview: (componentId) => set((s) => {
    if (!s.preview) return s
    return {
      components: [
        ...s.components.filter(c => c.componentId !== componentId),
        {
          componentId,
          bundle: s.preview.bundle,
          placement: s.preview.placement ?? { x: 0, y: 0, width: 30, height: 25 },
          manifest: s.preview.manifest,
        },
      ],
      preview: null,
    }
  }),
}))
```

---

## 11. Part 7 — `SlateCanvas` Update (Multi-Component)

**File:** `src/renderer/canvas/SlateCanvas.tsx`

The canvas renders ALL persisted components at their grid positions, plus the preview if active.

### 11.1 Full implementation

```typescript
import React from 'react'
import { useCanvasStore, type CanvasComponent } from '../store/canvasStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'

const GRID_PX = 8 // 1 grid unit = 8px

function CanvasItem({ component }: { component: CanvasComponent }) {
  const { x, y, width, height } = component.placement
  return (
    <div
      className="absolute bg-surface rounded-lg shadow-lg overflow-auto"
      style={{
        left: x * GRID_PX,
        top: y * GRID_PX,
        width: width * GRID_PX,
        height: height * GRID_PX,
      }}
    >
      <DynamicComponent bundle={component.bundle} />
    </div>
  )
}

export function SlateCanvas() {
  const components = useCanvasStore((s) => s.components)
  const preview = useCanvasStore((s) => s.preview)
  const shortcut = window.electron.platform === 'darwin' ? '⌘K' : 'Ctrl+K'
  const isEmpty = components.length === 0 && !preview

  return (
    <div className="flex-1 bg-background relative overflow-auto">
      {isEmpty ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center select-none">
            <img
              src={new URL('../assets/logo.png', import.meta.url).href}
              alt=""
              className="h-12 w-auto mx-auto mb-4 opacity-20"
              draggable={false}
            />
            <p className="text-muted text-base font-medium">Your Slate canvas</p>
            <p className="text-muted/60 text-sm mt-1">
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-surface border border-border text-muted rounded text-xs">
                {shortcut}
              </kbd>
              {' '}to describe a component
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Persisted components */}
          {components.map((comp) => (
            <CanvasItem key={comp.componentId} component={comp} />
          ))}
          {/* Ephemeral preview */}
          {preview && (
            <div
              className="absolute bg-surface rounded-lg shadow-lg overflow-auto ring-2 ring-primary/30"
              style={preview.placement ? {
                left: preview.placement.x * GRID_PX,
                top: preview.placement.y * GRID_PX,
                width: preview.placement.width * GRID_PX,
                height: preview.placement.height * GRID_PX,
              } : {
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '80%',
                maxHeight: '80%',
              }}
            >
              <DynamicComponent bundle={preview.bundle} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

The preview gets a `ring-2 ring-primary/30` border to visually distinguish it from persisted components.

---

## 12. Part 8 — Startup Hydration

### 12.1 New IPC handler: `canvas:load`

**File:** New handler registered in `src/main/ipc/project.ts` (or a new `src/main/ipc/canvas.ts`)

```typescript
ipcMain.handle('canvas:load', async (_e, args: { projectDir: string }) => {
  const canvasPath = join(args.projectDir, 'canvas.json')
  let canvas: CanvasJson
  try {
    const raw = await readFile(canvasPath, 'utf-8')
    canvas = JSON.parse(raw) as CanvasJson
  } catch {
    return { components: [] }
  }

  const components: Array<{
    componentId: string
    bundle: string
    placement: Placement
    manifest: unknown
  }> = []

  for (const entry of canvas.components) {
    const componentDir = join(args.projectDir, 'components', entry.componentId)
    try {
      const bundle = await readFile(join(componentDir, 'bundle.js'), 'utf-8')
      const manifestRaw = await readFile(join(componentDir, 'manifest.json'), 'utf-8')
      const manifest = JSON.parse(manifestRaw)
      components.push({
        componentId: entry.componentId,
        bundle,
        placement: entry.placement,
        manifest,
      })
    } catch {
      // Component dir missing or corrupted — skip silently, don't crash startup
      continue
    }
  }

  return { components }
})
```

### 12.2 Add to preload channels

```typescript
// In channels.ts ALLOWED_INVOKE_CHANNELS, add:
'canvas:load',
```

### 12.3 Renderer startup call

In `AppLayout.tsx` (or a dedicated hook), on mount:

```typescript
useEffect(() => {
  // TODO: projectDir should come from project open flow.
  // For now, use a default path.
  const projectDir = '...'
  window.electron.invoke('canvas:load', { projectDir }).then((result) => {
    useCanvasStore.getState().hydrate(result.components)
  })
}, [])
```

**Note on `projectDir`:** Currently `projectDir` is hardcoded as `''` in `useChat.ts`. The project open/create flow (`project:open`, `project:create`) exists in `project.ts` IPC but is not wired up in the renderer. This spec does not add project management UI — that is a separate feature. For now, `projectDir` should be set to a default project path (e.g., `~/CSlate/default` created on first launch). The startup hydration and canvas persistence work regardless of how `projectDir` is determined.

---

## 13. Part 9 — `useChat.ts` Update

**File:** `src/renderer/chat/useChat.ts`

### 13.1 Remove old code → capture pattern

Remove:
- `let pendingCode: string | null = null`
- The `agent:tool-call` listener for `renderComponent` code capture
- `setCurrentCode` usage

### 13.2 Updated `agent:tool-result` handler

```typescript
const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
  const d = data as { tool: string; result: Record<string, unknown> }

  if (d.tool === 'renderComponent' && d.result?.success) {
    const r = d.result as { bundle: string; files: Record<string, string>; manifest: unknown }
    useCanvasStore.getState().setPreview({
      bundle: r.bundle,
      files: r.files,
      manifest: r.manifest,
    })
  }

  if (d.tool === 'writeComponent' && d.result?.success) {
    const r = d.result as {
      componentId: string
      bundle: string
      placement: Placement
      manifest: unknown
    }
    useCanvasStore.getState().addComponent({
      componentId: r.componentId,
      bundle: r.bundle,
      placement: r.placement,
      manifest: r.manifest,
    })
    useCanvasStore.getState().clearPreview() // preview promoted to persisted
    setPublishState('prompting')
  }
})
```

### 13.3 `chatStore` changes

Remove `currentCode`, `currentFiles`, `setCurrentCode`, `setCurrentComponent`, `clearCurrentComponent`. The canvas state is now in `canvasStore`. `chatStore` keeps: `messages`, `status`, `panelOpen`, `publishState`.

```typescript
interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  panelOpen: boolean
  publishState: 'hidden' | 'prompting' | 'publishing' | 'published' | 'declined'
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setPanelOpen(v: boolean): void
  setPublishState(s: ChatState['publishState']): void
  reset(): void
}
```

---

## 14. Part 10 — `PublishToast` Update

**File:** `src/renderer/chat/PublishToast.tsx`

Reads from `canvasStore` instead of `chatStore`. Publishes the most recently added component's source files.

```typescript
// Option A: publish the last-added component's files from canvasStore.preview
const preview = useCanvasStore((s) => s.preview)

// In publish handler:
source: preview?.files ?? {}
```

Or, after `writeComponent`, the files are on disk. The publish handler could call `component:read` IPC. Either way, the source is now the full multi-file set, not just `ui.tsx`.

---

## 15. Part 11 — `PLATFORM_KNOWLEDGE` Prompt Update

**File:** `src/main/agent/prompts/fragments.ts`

### 15.1 Remove the now-incorrect rules

Remove the "ui.tsx Code Generation Rules" section added in the prior fix (function Component naming, no imports from other files). esbuild handles both.

### 15.2 Replace with accurate rules

```
### Component Code Rules

- ui.tsx is the entry point. It must have a **default export** — this is what renders on the canvas.
- You may import from other files in the package: `import { useWeatherData } from './hooks/useWeatherData'`
- You may use any directory structure: hooks/, components/, utils/, types/ etc.
- React and react-dom are available via import as normal.
- Do NOT import npm packages other than react/react-dom — they aren't available in the sandbox.
  Use bridge.fetch() for external data instead.
- Do NOT use fetch(), localStorage, or window APIs — use the bridge API.

### Component Persistence

- After calling renderComponent (preview), call writeComponent to persist the component.
- writeComponent saves source files + bundle to disk. The component survives app restart.
- The component appears on the canvas at the specified placement coordinates.
```

---

## 16. Part 12 — `engine.ts` Tool Creation Update

**File:** `src/main/agent/engine.ts`

`writeComponent` now needs `sender` and `tabId` to be consistent with the new signature. Update tool creation in the engine:

```typescript
const tools = {
  validateManifest,
  reviewCode: createReviewCodeTool(reg, fastModelId(this.config)),
  renderComponent: createRenderComponentTool(this.options.sender, this.options.tabId),
  writeComponent: createWriteComponentTool(this.projectDir, this.options.sender, this.options.tabId),
  readManifest: createReadManifestTool(this.projectDir),
  readProjectContext: createReadProjectContextTool(this.projectDir),
  searchBlueprints: createSearchBlueprintsTool(serverClient),
}
```

---

## 17. Infrastructure Changes

| Change | File | Details |
|---|---|---|
| Add `esbuild` | `package.json` dependencies | `"esbuild": "^0.25.0"` |
| Asar unpack | build config | `"asarUnpack": ["**/node_modules/esbuild/**", "**/node_modules/@esbuild/**"]` |
| Remove `@babel/standalone` | `package.json` dependencies | No longer needed at runtime |
| Remove Babel optimize | `electron.vite.config.ts` | Remove `optimizeDeps: { include: ['@babel/standalone'] }` |
| Upgrade `@cslate/shared` | `package.json` | After shared repo 0.2.0 is pushed |
| Add `canvas:load` channel | `src/preload/channels.ts` | Add to `ALLOWED_INVOKE_CHANNELS` |

---

## 18. Testing Strategy

### Unit tests

**`src/main/agent/lib/bundler.test.ts`**

| Test | Input | Expected |
|---|---|---|
| Single file default export | `{ 'ui.tsx': 'export default () => null' }` | Bundle string, evaluable |
| Multi-file import | ui.tsx imports `./hooks/useData.ts` | Resolves, bundle works |
| Deep nesting | ui.tsx → hooks/useData → utils/format | All resolved |
| Extension resolution | `import './useData'` finds `useData.ts` | Resolves |
| Index resolution | `import './hooks'` finds `hooks/index.ts` | Resolves |
| Missing import | `import './missing'` | Throws with clear message |
| React external | `import React from 'react'` | Externalized, not bundled |
| TypeScript generics | `<T extends object>` in code | Types stripped, bundle works |

**`src/main/agent/lib/canvasJson.test.ts`**

| Test | Expected |
|---|---|
| Read missing canvas.json | Returns `{ components: [] }` |
| Add component | Writes entry to canvas.json |
| Update existing component | Updates placement, no duplicates |
| Remove component | Removes entry, others unchanged |

**`@cslate/shared` — `src/schemas/manifest.test.ts`**

| Test | Expected |
|---|---|
| Missing ui.tsx | `{ valid: false, errors: ['ui.tsx is required'] }` |
| Path traversal `../evil` | `{ valid: false }` |
| Absolute path `/etc/passwd` | `{ valid: false }` |
| Valid with subdirectory | `{ valid: true }` |

**`src/renderer/sandbox/DynamicComponent.test.tsx`**

| Test | Expected |
|---|---|
| Valid bundle renders | Component appears |
| Runtime error | ErrorBoundary catches, ComponentError shown |
| No default export | Clear error message |
| Unknown require() | "Module X not available" message |

### Integration test

1. `npm run dev`
2. Build a multi-file component: "Build a weather dashboard with a hooks/useWeather.ts data hook"
3. Verify: component appears as preview
4. Verify: after writeComponent, component persists in `components/` dir with `bundle.js`
5. Restart app → verify: component loads from disk onto canvas

---

## 19. Rollout Order

1. **`@cslate/shared`** — schema superRefine + `validateComponentPackage()`. Bump 0.2.0, push.
2. **`CSlate` deps** — add esbuild, upgrade @cslate/shared, remove @babel/standalone from dependencies.
3. **`src/main/agent/lib/bundler.ts`** — new file, both functions, unit tests.
4. **`src/main/agent/lib/canvasJson.ts`** — canvas.json read/write helpers, unit tests.
5. **`src/main/agent/tools/renderComponent.ts`** — validation + temp-dir bundling.
6. **`src/main/agent/tools/writeComponent.ts`** — validation + disk bundling + canvas.json.
7. **`src/main/agent/engine.ts`** — pass sender to writeComponent.
8. **`src/preload/channels.ts`** — add `canvas:load`.
9. **`src/main/ipc/project.ts`** or new `canvas.ts` — `canvas:load` IPC handler.
10. **`src/renderer/store/canvasStore.ts`** — new store.
11. **`src/renderer/sandbox/DynamicComponent.tsx`** — CJS eval replaces Babel.
12. **`src/renderer/canvas/SlateCanvas.tsx`** — multi-component + preview.
13. **`src/renderer/chat/useChat.ts`** — capture tool results → canvasStore.
14. **`src/renderer/store/chatStore.ts`** — remove currentCode.
15. **`src/renderer/chat/PublishToast.tsx`** — read from canvasStore.
16. **`src/renderer/layout/AppLayout.tsx`** — startup hydration.
17. **`src/main/agent/prompts/fragments.ts`** — update PLATFORM_KNOWLEDGE.
18. **`electron.vite.config.ts`** — remove Babel optimizeDeps.

Each step should have passing typecheck + relevant unit tests before proceeding. Steps 1–9 are backend-only. Step 11 (DynamicComponent) is the visible integration point.

---

## 20. Edge Cases & Decisions

| Topic | Decision |
|---|---|
| **CSS files** | esbuild bundles CSS but it won't be injected into the DOM by `new Function`. Components should use Tailwind. Future: extract and inject `<style>`. |
| **JSON imports** | Supported natively by esbuild. `import data from './data.json'` works. |
| **Large bundles via IPC** | Typical component bundles are < 50KB. Electron IPC handles this fine. |
| **Bundle caching** | None. esbuild is fast enough (~5ms). Rebuild on every write. |
| **bundle.js in .gitignore** | Yes — it's a build artifact. Can be rebuilt from source by calling `bundleComponentDir()`. |
| **Corrupt bundle.js on startup** | `canvas:load` silently skips components with missing/corrupt bundles. A "rebuild bundles" action can be added later. |
| **projectDir not wired up** | The renderer currently passes `projectDir: ''`. This spec works regardless — the canvas persistence just needs a valid projectDir. Wiring up project open/create UI is a separate feature. For now, use a default path created on first launch. |
| **Component deletion** | Out of scope for this spec but straightforward: call `removeFromCanvasJson()`, `rm -rf componentDir`, send `canvas:component-removed` IPC. |
| **sandbox:load channel** | Dead code in current design. Remove from `ALLOWED_SEND_CHANNELS` during cleanup. |
| **Re-bundling on modify** | `writeComponent` overwrites source + `bundle.js`. The canvas entry updates in-place. Same flow as initial write. |
