# Component Sandbox Bundling & Persistent Canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-file Babel sandbox with esbuild bundling, add canvas persistence so components survive restart, and enforce package validation at the schema level.

**Architecture:** esbuild bundles component files (temp dir for preview, component dir for persist) into CJS evaluated by a require-shimmed `new Function`. `canvas.json` tracks what's on the canvas; on startup, `bundle.js` files are loaded from disk and hydrated into a `canvasStore`. `@cslate/shared` enforces `ui.tsx` required + path safety.

**Tech Stack:** esbuild (bundling), Zod (schema validation), Zustand (canvas store), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-31-component-sandbox-bundling-design.md`

---

## File Map

### New files
| File | Purpose |
|---|---|
| `src/main/agent/lib/bundler.ts` | esbuild bundling (temp dir + from-dir) |
| `src/main/agent/lib/bundler.test.ts` | Bundler unit tests |
| `src/main/agent/lib/canvasJson.ts` | Read/write/update `canvas.json` |
| `src/main/agent/lib/canvasJson.test.ts` | canvas.json helper tests |
| `src/renderer/store/canvasStore.ts` | Zustand store for persistent canvas + preview |

### Modified files
| File | What changes |
|---|---|
| `CSlate-shared/src/schemas/manifest.ts:143-146` | `ComponentPackageSchema.files` superRefine + `validateComponentPackage()` |
| `CSlate-shared/src/index.ts:4` | Export new function + type |
| `CSlate-shared/package.json:3` | Version bump 0.1.0 → 0.2.0 |
| `package.json` | Add esbuild dep, move @babel/standalone to devDeps |
| `src/main/agent/tools/renderComponent.ts` | Open files schema, validation, temp-dir bundling |
| `src/main/agent/tools/writeComponent.ts` | Open files schema, validation, disk bundling + canvas.json |
| `src/main/agent/engine.ts:73` | Pass sender/tabId to writeComponent |
| `src/preload/channels.ts:9-30` | Add `canvas:load` to invoke channels |
| `src/main/ipc/project.ts` | Add `canvas:load` IPC handler |
| `src/renderer/sandbox/DynamicComponent.tsx` | CJS eval replaces Babel |
| `src/renderer/canvas/SlateCanvas.tsx` | Multi-component canvas + preview |
| `src/renderer/store/chatStore.ts` | Remove currentCode, setCurrentCode |
| `src/renderer/chat/useChat.ts:42-57` | Capture bundle/files from tool-result → canvasStore |
| `src/renderer/chat/PublishToast.tsx` | Read from canvasStore.preview |
| `src/renderer/layout/AppLayout.tsx` | Startup hydration |
| `src/main/agent/prompts/fragments.ts:32-62` | Replace Component naming rules with default export rules |
| `electron.vite.config.ts:32-34` | Remove @babel/standalone optimizeDeps |

---

## Task 1: `@cslate/shared` — Schema Hardening

**Files:**
- Modify: `/Users/tomerast/Projects/CSlate-shared/src/schemas/manifest.ts:143-146`
- Modify: `/Users/tomerast/Projects/CSlate-shared/src/index.ts`
- Modify: `/Users/tomerast/Projects/CSlate-shared/package.json:3`
- Create: `/Users/tomerast/Projects/CSlate-shared/src/schemas/__tests__/package-validation.test.ts`

- [ ] **Step 1: Create test file for `validateComponentPackage`**

```typescript
// src/schemas/__tests__/package-validation.test.ts
import { describe, it, expect } from 'vitest'
import { validateComponentPackage } from '../manifest'

// Minimal valid manifest for tests
const VALID_MANIFEST = {
  name: 'Test',
  description: 'A test component',
  tags: ['test'],
  inputs: {},
  outputs: {},
  events: {},
  actions: {},
  files: [{ path: 'ui.tsx', type: 'ui', role: 'main render' }],
  defaultSize: { width: 30, height: 25 },
}

describe('validateComponentPackage', () => {
  it('accepts valid package with ui.tsx', () => {
    const result = validateComponentPackage({
      manifest: VALID_MANIFEST,
      files: { 'ui.tsx': 'export default () => null' },
    })
    expect(result.valid).toBe(true)
  })

  it('accepts package with subdirectories', () => {
    const result = validateComponentPackage({
      manifest: VALID_MANIFEST,
      files: {
        'ui.tsx': 'export default () => null',
        'hooks/useData.ts': 'export function useData() {}',
        'utils/format.ts': 'export function fmt() {}',
      },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects package missing ui.tsx', () => {
    const result = validateComponentPackage({
      manifest: VALID_MANIFEST,
      files: { 'logic.ts': 'export const x = 1' },
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('ui.tsx is required'))
  })

  it('rejects path traversal', () => {
    const result = validateComponentPackage({
      manifest: VALID_MANIFEST,
      files: { 'ui.tsx': 'export default () => null', '../evil.ts': 'bad' },
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Path traversal'))
  })

  it('rejects absolute paths', () => {
    const result = validateComponentPackage({
      manifest: VALID_MANIFEST,
      files: { 'ui.tsx': 'export default () => null', '/etc/passwd': 'bad' },
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Absolute paths'))
  })

  it('rejects null bytes in path', () => {
    const result = validateComponentPackage({
      manifest: VALID_MANIFEST,
      files: { 'ui.tsx': 'export default () => null', 'evil\0.ts': 'bad' },
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('Null bytes'))
  })

  it('rejects invalid manifest', () => {
    const result = validateComponentPackage({
      manifest: { name: '' }, // invalid: name too short, missing required fields
      files: { 'ui.tsx': 'export default () => null' },
    })
    expect(result.valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tomerast/Projects/CSlate-shared && npx vitest run src/schemas/__tests__/package-validation.test.ts`
Expected: FAIL — `validateComponentPackage` does not exist yet.

- [ ] **Step 3: Implement `validateComponentPackage` and update `ComponentPackageSchema`**

In `/Users/tomerast/Projects/CSlate-shared/src/schemas/manifest.ts`, replace lines 143-146 and add:

```typescript
export const ComponentPackageSchema = z.object({
  manifest: ComponentManifestSchema,
  files: z.record(z.string()).superRefine((files, ctx) => {
    if (!('ui.tsx' in files)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ui.tsx is required — it is the component entry point',
        path: ['ui.tsx'],
      })
    }
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

export type ComponentPackage = z.infer<typeof ComponentPackageSchema>

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

- [ ] **Step 4: Export from index.ts**

In `/Users/tomerast/Projects/CSlate-shared/src/index.ts`, the `export * from './schemas/manifest'` already re-exports everything. Verify `validateComponentPackage` and `PackageValidationResult` are included.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/tomerast/Projects/CSlate-shared && npx vitest run src/schemas/__tests__/package-validation.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 6: Bump version**

In `/Users/tomerast/Projects/CSlate-shared/package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 7: Build and commit**

```bash
cd /Users/tomerast/Projects/CSlate-shared
npm run build
git add -A
git commit -m "feat: add ComponentPackageSchema validation + validateComponentPackage()"
git push origin main
```

---

## Task 2: CSlate Client — Add esbuild, Upgrade Shared

**Files:**
- Modify: `/Users/tomerast/Projects/CSlate/package.json`

- [ ] **Step 1: Install esbuild and upgrade @cslate/shared**

```bash
cd /Users/tomerast/Projects/CSlate
npm install esbuild
npm install github:tomerast/CSlate-shared
```

This adds `esbuild` to dependencies and pulls the updated `@cslate/shared` with `validateComponentPackage`.

- [ ] **Step 2: Verify esbuild is available**

```bash
cd /Users/tomerast/Projects/CSlate
node -e "const esbuild = require('esbuild'); console.log('esbuild version:', esbuild.version)"
```

Expected: Prints esbuild version (e.g., `0.25.x`).

- [ ] **Step 3: Verify validateComponentPackage is importable**

```bash
cd /Users/tomerast/Projects/CSlate
node -e "const { validateComponentPackage } = require('@cslate/shared'); console.log(typeof validateComponentPackage)"
```

Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add esbuild, upgrade @cslate/shared to 0.2.0"
```

---

## Task 3: Bundler Module

**Files:**
- Create: `src/main/agent/lib/bundler.ts`
- Create: `src/main/agent/lib/__tests__/bundler.test.ts`

- [ ] **Step 1: Write bundler tests**

```typescript
// src/main/agent/lib/__tests__/bundler.test.ts
import { describe, it, expect } from 'vitest'
import { bundleComponentFiles } from '../bundler'

describe('bundleComponentFiles', () => {
  it('bundles a single-file component with default export', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': 'export default function App() { return null }',
    })
    expect(bundle).toContain('exports')
    // Evaluate the bundle to verify it works
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string) => {
      if (mod === 'react') return { createElement: () => null }
      throw new Error(`unexpected require: ${mod}`)
    }
    new Function('require', 'module', 'exports', bundle)(_require, _module, _module.exports)
    expect(typeof _module.exports['default']).toBe('function')
  })

  it('resolves relative imports between files', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `
        import { greeting } from './utils/greet'
        export default function App() { return greeting }
      `,
      'utils/greet.ts': `export const greeting = 'hello'`,
    })
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string) => {
      if (mod === 'react') return {}
      throw new Error(`unexpected require: ${mod}`)
    }
    new Function('require', 'module', 'exports', bundle)(_require, _module, _module.exports)
    expect(typeof _module.exports['default']).toBe('function')
  })

  it('resolves imports without file extensions', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import { x } from './data'\nexport default function App() { return x }`,
      'data.ts': `export const x = 42`,
    })
    expect(bundle).toBeTruthy()
  })

  it('resolves index files', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import { x } from './hooks'\nexport default function App() { return x }`,
      'hooks/index.ts': `export const x = 42`,
    })
    expect(bundle).toBeTruthy()
  })

  it('externalizes react', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import React from 'react'\nexport default function App() { return React.createElement('div') }`,
    })
    // react should NOT be bundled — should appear as require("react")
    expect(bundle).toContain('require')
    expect(bundle).toContain('react')
  })

  it('handles TypeScript generics and types', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `
        interface Props<T extends string> { value: T }
        export default function App(props: Props<string>) { return null }
      `,
    })
    expect(bundle).toBeTruthy()
  })

  it('throws on missing import', async () => {
    await expect(
      bundleComponentFiles({
        'ui.tsx': `import { x } from './missing'\nexport default function App() { return x }`,
      })
    ).rejects.toThrow()
  })

  it('chains deep imports: ui → hooks → utils', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import { useData } from './hooks/useData'\nexport default function App() { return useData() }`,
      'hooks/useData.ts': `import { format } from '../utils/format'\nexport function useData() { return format(42) }`,
      'utils/format.ts': `export function format(n: number) { return String(n) }`,
    })
    expect(bundle).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/agent/lib/__tests__/bundler.test.ts`
Expected: FAIL — `bundler.ts` does not exist.

- [ ] **Step 3: Implement `bundler.ts`**

```typescript
// src/main/agent/lib/bundler.ts
import * as esbuild from 'esbuild'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'

const EXTERNALS = ['react', 'react-dom']

/**
 * Bundle component files into a single CJS string.
 * Writes to a temp dir, runs esbuild with native resolution, cleans up.
 * Entry point is always ui.tsx.
 */
export async function bundleComponentFiles(
  files: Record<string, string>
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cslate-build-'))
  try {
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
      external: EXTERNALS,
    })

    if (result.errors.length > 0) {
      throw new Error(result.errors.map(e => e.text).join('\n'))
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Bundle a component from its persisted directory on disk.
 * Used by writeComponent after source files are already written.
 */
export async function bundleComponentDir(componentDir: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [join(componentDir, 'ui.tsx')],
    bundle: true,
    format: 'cjs',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    external: EXTERNALS,
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors.map(e => e.text).join('\n'))
  }

  return result.outputFiles[0].text
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/agent/lib/__tests__/bundler.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/lib/bundler.ts src/main/agent/lib/__tests__/bundler.test.ts
git commit -m "feat: esbuild bundler for component files"
```

---

## Task 4: Canvas JSON Helpers

**Files:**
- Create: `src/main/agent/lib/canvasJson.ts`
- Create: `src/main/agent/lib/__tests__/canvasJson.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/main/agent/lib/__tests__/canvasJson.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readCanvasJson, updateCanvasJson, removeFromCanvasJson } from '../canvasJson'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'cslate-canvas-test-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('readCanvasJson', () => {
  it('returns empty components when canvas.json does not exist', async () => {
    const result = await readCanvasJson(projectDir)
    expect(result).toEqual({ components: [] })
  })
})

describe('updateCanvasJson', () => {
  it('creates canvas.json with new component', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    const raw = await readFile(join(projectDir, 'canvas.json'), 'utf-8')
    const data = JSON.parse(raw)
    expect(data.components).toHaveLength(1)
    expect(data.components[0].componentId).toBe('weather')
    expect(data.components[0].placement.x).toBe(10)
  })

  it('updates existing component placement', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await updateCanvasJson(projectDir, 'weather', { x: 20, y: 10, width: 30, height: 25 })
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(1)
    expect(result.components[0].placement.x).toBe(20)
  })

  it('adds second component without affecting first', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await updateCanvasJson(projectDir, 'stocks', { x: 50, y: 5, width: 25, height: 20 })
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(2)
  })
})

describe('removeFromCanvasJson', () => {
  it('removes component by id', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await updateCanvasJson(projectDir, 'stocks', { x: 50, y: 5, width: 25, height: 20 })
    await removeFromCanvasJson(projectDir, 'weather')
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(1)
    expect(result.components[0].componentId).toBe('stocks')
  })

  it('is a no-op for missing component', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await removeFromCanvasJson(projectDir, 'nonexistent')
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/agent/lib/__tests__/canvasJson.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `canvasJson.ts`**

```typescript
// src/main/agent/lib/canvasJson.ts
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasEntry {
  componentId: string
  placement: Placement
}

export interface CanvasJson {
  components: CanvasEntry[]
}

export async function readCanvasJson(projectDir: string): Promise<CanvasJson> {
  try {
    const raw = await readFile(join(projectDir, 'canvas.json'), 'utf-8')
    return JSON.parse(raw) as CanvasJson
  } catch {
    return { components: [] }
  }
}

export async function updateCanvasJson(
  projectDir: string,
  componentId: string,
  placement: Placement
): Promise<void> {
  const canvas = await readCanvasJson(projectDir)
  const idx = canvas.components.findIndex(c => c.componentId === componentId)
  if (idx >= 0) {
    canvas.components[idx].placement = placement
  } else {
    canvas.components.push({ componentId, placement })
  }
  await writeFile(join(projectDir, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf-8')
}

export async function removeFromCanvasJson(
  projectDir: string,
  componentId: string
): Promise<void> {
  const canvas = await readCanvasJson(projectDir)
  canvas.components = canvas.components.filter(c => c.componentId !== componentId)
  await writeFile(join(projectDir, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf-8')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/agent/lib/__tests__/canvasJson.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/lib/canvasJson.ts src/main/agent/lib/__tests__/canvasJson.test.ts
git commit -m "feat: canvas.json read/write/remove helpers"
```

---

## Task 5: Update `renderComponent` Tool

**Files:**
- Modify: `src/main/agent/tools/renderComponent.ts`

- [ ] **Step 1: Rewrite renderComponent.ts**

Replace the entire file content:

```typescript
// src/main/agent/tools/renderComponent.ts
import type { Tool } from 'ai'
import { z } from 'zod'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentFiles } from '../lib/bundler'
import { stripFences } from '../lib/stripFences'

const PlacementSchema = z.object({
  x: z.number().describe('Grid units from left'),
  y: z.number().describe('Grid units from top'),
  width: z.number().describe('Width in grid units (1 unit = 8px)'),
  height: z.number().describe('Height in grid units'),
})

type RenderInput = {
  files: Record<string, string>
  manifest: unknown
  placement?: z.infer<typeof PlacementSchema>
}

type RenderOutput = {
  success: boolean
  componentId: string
  bundle?: string
  files?: Record<string, string>
  errors?: string[]
}

export function createRenderComponentTool(): Tool<RenderInput, RenderOutput> {
  return {
    description:
      'Preview a component on the canvas. Bundles all files with esbuild and renders ' +
      'the default export from ui.tsx. This is an ephemeral preview — call writeComponent to persist.',
    inputSchema: z.object({
      files: z.record(z.string()).describe(
        'Component files keyed by relative path. ui.tsx is required. ' +
        'May include any structure: "hooks/useData.ts", "components/Chart.tsx", etc.'
      ),
      manifest: z.any().describe('The ComponentManifest object'),
      placement: PlacementSchema.optional().describe('Where to place the preview on canvas.'),
    }) as any,
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
  }
}
```

- [ ] **Step 2: Update engine.ts tool creation — renderComponent no longer needs sender/tabId**

In `src/main/agent/engine.ts`, change line 72 from:
```typescript
renderComponent: createRenderComponentTool(this.options.sender, this.options.tabId),
```
to:
```typescript
renderComponent: createRenderComponentTool(),
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No new errors related to renderComponent. (Pre-existing errors are OK for now.)

- [ ] **Step 4: Commit**

```bash
git add src/main/agent/tools/renderComponent.ts src/main/agent/engine.ts
git commit -m "feat: renderComponent uses esbuild bundling + package validation"
```

---

## Task 6: Update `writeComponent` Tool

**Files:**
- Modify: `src/main/agent/tools/writeComponent.ts`
- Modify: `src/main/agent/engine.ts:73`

- [ ] **Step 1: Rewrite writeComponent.ts**

Replace the entire file content:

```typescript
// src/main/agent/tools/writeComponent.ts
import type { Tool } from 'ai'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join, resolve, sep, dirname } from 'path'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentDir } from '../lib/bundler'
import { updateCanvasJson, type Placement } from '../lib/canvasJson'
import { stripFences } from '../lib/stripFences'

const PlacementSchema = z.object({
  x: z.number().describe('Grid units from left'),
  y: z.number().describe('Grid units from top'),
  width: z.number().describe('Width in grid units (1 unit = 8px)'),
  height: z.number().describe('Height in grid units'),
})

type WriteInput = {
  componentId: string
  files: Record<string, string>
  manifest: Record<string, unknown>
  placement?: Placement
}

type WriteOutput = {
  success: boolean
  path: string
  componentId?: string
  bundle?: string
  placement?: Placement
  manifest?: unknown
  errors?: string[]
}

export function createWriteComponentTool(projectDir: string): Tool<WriteInput, WriteOutput> {
  return {
    description:
      'Save a component package to disk and place it on the canvas permanently. ' +
      'Writes source files, builds bundle.js, and updates canvas.json. ' +
      'Only call after validateManifest returns valid=true.',
    inputSchema: z.object({
      componentId: z.string()
        .regex(/^[a-z0-9][a-z0-9_-]*$/)
        .describe('lowercase identifier, e.g. "weather_widget"'),
      files: z.record(z.string()).describe(
        'All component files by relative path. ui.tsx required. ' +
        'Include any structure. Include "context.md" as a file.'
      ),
      manifest: z.any().describe('The validated ComponentManifest object'),
      placement: PlacementSchema.optional().describe('Where to place on canvas.'),
    }) as any,
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

      // 4. Write source files
      await mkdir(componentDir, { recursive: true })
      await writeFile(join(componentDir, 'manifest.json'), JSON.stringify(input.manifest, null, 2), 'utf-8')
      await Promise.all(
        Object.entries(cleanFiles).map(async ([filePath, content]) => {
          const target = join(componentDir, filePath)
          if (!target.startsWith(componentDir + sep) && target !== componentDir + sep + filePath) {
            throw new Error(`Path traversal in files: "${filePath}"`)
          }
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, content, 'utf-8')
        })
      )

      // 5. Bundle from written source
      let bundle: string
      try {
        bundle = await bundleComponentDir(componentDir)
      } catch (e) {
        return { success: false, path: componentDir, errors: [e instanceof Error ? e.message : String(e)] }
      }

      // 6. Write bundle.js
      await writeFile(join(componentDir, 'bundle.js'), bundle, 'utf-8')

      // 7. Update canvas.json
      const placement: Placement = input.placement ?? {
        x: 0,
        y: 0,
        width: (input.manifest as any)?.defaultSize?.width ?? 30,
        height: (input.manifest as any)?.defaultSize?.height ?? 25,
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
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Pass (or only pre-existing errors).

- [ ] **Step 3: Commit**

```bash
git add src/main/agent/tools/writeComponent.ts
git commit -m "feat: writeComponent persists source + bundle.js + canvas.json"
```

---

## Task 7: Canvas Store + DynamicComponent + SlateCanvas

**Files:**
- Create: `src/renderer/store/canvasStore.ts`
- Modify: `src/renderer/sandbox/DynamicComponent.tsx`
- Modify: `src/renderer/canvas/SlateCanvas.tsx`

- [ ] **Step 1: Create canvasStore.ts**

```typescript
// src/renderer/store/canvasStore.ts
import { create } from 'zustand'

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

interface CanvasState {
  components: CanvasComponent[]
  preview: CanvasPreview | null

  hydrate(components: CanvasComponent[]): void
  addComponent(comp: CanvasComponent): void
  removeComponent(componentId: string): void
  setPreview(preview: CanvasPreview): void
  clearPreview(): void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  components: [],
  preview: null,

  hydrate: (components) => set({ components }),

  addComponent: (comp) => set((s) => ({
    components: [
      ...s.components.filter(c => c.componentId !== comp.componentId),
      comp,
    ],
  })),

  removeComponent: (componentId) => set((s) => ({
    components: s.components.filter(c => c.componentId !== componentId),
  })),

  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),
}))
```

- [ ] **Step 2: Rewrite DynamicComponent.tsx**

Replace the entire file:

```typescript
// src/renderer/sandbox/DynamicComponent.tsx
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

- [ ] **Step 3: Rewrite SlateCanvas.tsx**

Replace the entire file:

```typescript
// src/renderer/canvas/SlateCanvas.tsx
import React from 'react'
import { useCanvasStore, type CanvasComponent } from '../store/canvasStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'

const GRID_PX = 8

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
          {components.map((comp) => (
            <CanvasItem key={comp.componentId} component={comp} />
          ))}
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

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: May show errors in chatStore consumers (useChat, PublishToast) referencing `currentCode` — fixed in next task.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/canvasStore.ts src/renderer/sandbox/DynamicComponent.tsx src/renderer/canvas/SlateCanvas.tsx
git commit -m "feat: canvasStore + CJS eval DynamicComponent + multi-component SlateCanvas"
```

---

## Task 8: Update chatStore, useChat, PublishToast

**Files:**
- Modify: `src/renderer/store/chatStore.ts`
- Modify: `src/renderer/chat/useChat.ts`
- Modify: `src/renderer/chat/PublishToast.tsx`

- [ ] **Step 1: Remove `currentCode` from chatStore.ts**

In `src/renderer/store/chatStore.ts`, remove `currentCode`, `setCurrentCode` — the canvas state is now in canvasStore. The store becomes:

```typescript
import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

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

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  status: 'idle',
  panelOpen: false,
  publishState: 'hidden',
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  setPublishState: (s) => set({ publishState: s }),
  reset: () => set({ messages: [], status: 'idle', panelOpen: false, publishState: 'hidden' }),
}))
```

- [ ] **Step 2: Rewrite useChat.ts tool-result handling**

Replace the entire `useChat.ts`:

```typescript
// src/renderer/chat/useChat.ts
import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { useCanvasStore, type Placement } from '../store/canvasStore'

const MAX_HISTORY_MESSAGES = 6

export function useChat() {
  const { addMessage, setStatus, setPanelOpen, setPublishState } = useChatStore()

  const submit = useCallback(async (text: string) => {
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPanelOpen(true)
    setPublishState('hidden')

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

    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as { tool: string; result: Record<string, unknown> }

      if (d.tool === 'renderComponent' && d.result?.success) {
        const r = d.result as {
          bundle: string
          files: Record<string, string>
          manifest: unknown
          placement?: Placement
        }
        useCanvasStore.getState().setPreview({
          bundle: r.bundle,
          files: r.files,
          manifest: r.manifest,
          placement: r.placement,
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
        useCanvasStore.getState().clearPreview()
        setPublishState('prompting')
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
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir: '',
        tabId: crypto.randomUUID(),
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offToolResult()
      offError()
    }
  }, [addMessage, setStatus, setPanelOpen, setPublishState])

  return { submit }
}
```

- [ ] **Step 3: Update PublishToast.tsx**

In `src/renderer/chat/PublishToast.tsx`, change:
- Import `useCanvasStore` instead of reading `currentCode` from `chatStore`
- Read source from `canvasStore.preview?.files` or the last-added component
- Replace `source: { 'ui.tsx': currentCode ?? '' }` with `source: preview?.files ?? {}`

Find the line that reads `currentCode`:
```typescript
const currentCode = useChatStore((s) => s.currentCode)
```
Replace with:
```typescript
const preview = useCanvasStore((s) => s.preview)
```

Find the publish source reference and replace:
```typescript
source: { 'ui.tsx': currentCode ?? '' },
```
with:
```typescript
source: preview?.files ?? {},
```

Add import at top:
```typescript
import { useCanvasStore } from '../store/canvasStore'
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors referencing `currentCode`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/chatStore.ts src/renderer/chat/useChat.ts src/renderer/chat/PublishToast.tsx
git commit -m "feat: useChat routes tool results to canvasStore, remove currentCode"
```

---

## Task 9: Startup Hydration + IPC

**Files:**
- Modify: `src/preload/channels.ts`
- Modify: `src/main/ipc/project.ts`
- Modify: `src/renderer/layout/AppLayout.tsx`

- [ ] **Step 1: Add `canvas:load` to preload channels**

In `src/preload/channels.ts`, add `'canvas:load'` to the `ALLOWED_INVOKE_CHANNELS` array (after `'component:list'`).

- [ ] **Step 2: Add `canvas:load` IPC handler**

In `src/main/ipc/project.ts`, add this handler inside the `register` function, after the existing handlers:

```typescript
  ipcMain.handle('canvas:load', async (_e, args: { projectDir: string }) => {
    const canvasPath = join(args.projectDir, 'canvas.json')
    let canvas: { components: Array<{ componentId: string; placement: { x: number; y: number; width: number; height: number } }> }
    try {
      const raw = await fs.readFile(canvasPath, 'utf-8')
      canvas = JSON.parse(raw)
    } catch {
      return { components: [] }
    }

    const components: Array<{
      componentId: string
      bundle: string
      placement: { x: number; y: number; width: number; height: number }
      manifest: unknown
    }> = []

    for (const entry of canvas.components) {
      const componentDir = join(args.projectDir, 'components', entry.componentId)
      try {
        const bundle = await fs.readFile(join(componentDir, 'bundle.js'), 'utf-8')
        const manifestRaw = await fs.readFile(join(componentDir, 'manifest.json'), 'utf-8')
        const manifest = JSON.parse(manifestRaw)
        components.push({
          componentId: entry.componentId,
          bundle,
          placement: entry.placement,
          manifest,
        })
      } catch {
        continue // Skip corrupted/missing components
      }
    }

    return { components }
  })
```

Add `join` import from `path` if not already imported (it already is in project.ts).

- [ ] **Step 3: Add startup hydration in AppLayout.tsx**

In `src/renderer/layout/AppLayout.tsx`, add after the existing imports:

```typescript
import { useCanvasStore } from '../store/canvasStore'
```

Add a useEffect for canvas hydration inside `AppLayout`, after the existing keydown effect:

```typescript
  useEffect(() => {
    // Hydrate canvas from disk on startup
    // TODO: projectDir should come from project open flow
    window.electron.invoke('canvas:load', { projectDir: '' }).then((result: any) => {
      if (result?.components?.length > 0) {
        useCanvasStore.getState().hydrate(result.components)
      }
    }).catch(() => {
      // No project open yet — canvas starts empty
    })
  }, [])
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preload/channels.ts src/main/ipc/project.ts src/renderer/layout/AppLayout.tsx
git commit -m "feat: canvas:load IPC + startup hydration"
```

---

## Task 10: Update Prompts + Remove Babel + Cleanup

**Files:**
- Modify: `src/main/agent/prompts/fragments.ts`
- Modify: `electron.vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Update PLATFORM_KNOWLEDGE in fragments.ts**

In `src/main/agent/prompts/fragments.ts`, replace the entire "ui.tsx Code Generation Rules" section (lines 32-62, the block added in the previous fix) with:

```
### Component Code Rules

- ui.tsx is the entry point. It must have a **default export** — this is the component rendered on the canvas.
  \`\`\`tsx
  // CORRECT:
  export default function WeatherDashboard() { ... }

  // WRONG (no default export):
  function Component() { ... }
  \`\`\`
- You may import from other files in the package: \`import { useWeatherData } from './hooks/useWeatherData'\`
- You may use any directory structure: hooks/, components/, utils/, types/ etc.
- React and react-dom are available via import as normal.
- Do NOT import npm packages other than react/react-dom — they are not available in the sandbox.
  Use bridge.fetch() for external data instead.
- Do NOT use fetch(), localStorage, or window APIs — use the bridge API.
```

- [ ] **Step 2: Remove Babel optimizeDeps from electron.vite.config.ts**

In `electron.vite.config.ts`, remove lines 32-34:
```typescript
    optimizeDeps: {
      include: ['@babel/standalone']
    },
```

- [ ] **Step 3: Move @babel/standalone to devDependencies**

```bash
npm install --save-dev @babel/standalone
```

This moves it from `dependencies` to `devDependencies` (it may still be needed for tests or playground). If no tests reference it, remove entirely instead:

```bash
npm uninstall @babel/standalone && npm uninstall @types/babel__standalone
```

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: PASS. Some existing tests may need updating if they reference `currentCode` — fix any failures.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/prompts/fragments.ts electron.vite.config.ts package.json package-lock.json
git commit -m "feat: update prompts for default export, remove Babel runtime dep"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (or only pre-existing, unrelated errors).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass. Fix any failures caused by the refactor (likely in `useChat.test.ts` which references `currentCode`).

- [ ] **Step 3: Dev smoke test**

Run: `npm run dev`

1. App launches with empty canvas (no components yet)
2. Press Cmd+K, type "Build a weather dashboard with a hooks/useWeather.ts data hook"
3. Verify: preview appears on canvas (ring border)
4. Verify: after writeComponent, ring disappears (persisted)
5. Check `components/` directory has source files + `bundle.js`
6. Check `canvas.json` has the component entry
7. Restart app (Cmd+Q, then `npm run dev`)
8. Verify: component loads from disk onto canvas

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix any remaining test/type issues from sandbox refactor"
```
