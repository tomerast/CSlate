# Coding Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six new tools (readFile, grep, glob, bash, lsp, webFetch) to CSlate's build/fix sub-agents and orchestrator, giving them full coding capabilities while respecting role-appropriate tool sets.

**Architecture:** Role-optimized tiers — build agents get exploration tools (readFile, grep, glob, webFetch), fix agents get verification tools (bash, lsp, readFile, grep, glob), and the orchestrator gets all six. `buildToolSet` gains a `tier` param for sub-agents; the orchestrator imports new tools directly. Sub-agents switch from `generateText` (no tools) to `generateText` with tools and `maxSteps: 8`.

**Tech Stack:** TypeScript, Node.js `child_process`, `fs/promises`, Vitest (mocked child_process for bash/lsp tests), AI SDK `generateText` with tools, Electron IPC.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/main/agent/tools/readFile.ts` | Read any file within projectDir |
| `src/main/agent/tools/readFile.__tests__/readFile.test.ts` | readFile tests |
| `src/main/agent/tools/grep.ts` | Recursive regex search across project files |
| `src/main/agent/tools/grep.__tests__/grep.test.ts` | grep tests |
| `src/main/agent/tools/glob.ts` | File pattern matching |
| `src/main/agent/tools/glob.__tests__/glob.test.ts` | glob tests |
| `src/main/agent/tools/bash/permissions.ts` | Risky command classifier |
| `src/main/agent/tools/bash/executor.ts` | child_process wrapper (timeout, abort) |
| `src/main/agent/tools/bash.ts` | Bash shell execution tool |
| `src/main/agent/tools/bash/__tests__/permissions.test.ts` | Permissions classifier tests |
| `src/main/agent/tools/bash/__tests__/bash.test.ts` | Bash tool integration tests |
| `src/main/agent/tools/lsp.ts` | TypeScript diagnostics via tsc --noEmit |
| `src/main/agent/tools/lsp.__tests__/lsp.test.ts` | LSP tool tests |
| `src/main/agent/tools/webFetch.ts` | Fetch web content (CSlate server first) |
| `src/main/agent/tools/webFetch.__tests__/webFetch.test.ts` | webFetch tests |

### Modified files
| File | Change |
|------|--------|
| `src/main/agent/tools/index.ts` | Add `tier` param to `buildToolSet`, export new tools, add `PermissionBroker` to `ToolFactoryDeps` |
| `src/main/agent/orchestrator/sub-agent.ts` | Pass tier-appropriate `aiTools` to `generateText`, increase `maxOutputTokens` to 12000, set `maxSteps: 8` |
| `src/main/agent/orchestrator/index.ts` | Import and register six new tools in orchestrator's `streamText` call |
| `src/preload/channels.ts` | Add `agent:permission-request` to `ALLOWED_LISTEN_CHANNELS`, `agent:permission-response` to `ALLOWED_INVOKE_CHANNELS` |
| `src/main/agent/ipc.ts` | Create `PermissionBroker`, pass to `buildToolSet`, handle `agent:permission-response` IPC |

---

## Task 1: Extend `buildToolSet` with tier + `PermissionBroker`

**Files:**
- Modify: `src/main/agent/tools/index.ts`

- [ ] **Step 1.1: Write failing test**

Create `src/main/agent/tools/__tests__/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildToolSet } from '../index'

const fakeDeps = {
  projectDir: '/tmp/test',
  registry: { languageModel: (_id: string) => ({}) },
  fastModelId: 'fast',
  serverClient: null,
  permissionBroker: { request: async (_cmd: string) => true },
}

describe('buildToolSet', () => {
  it('build tier includes readFile, grep, glob, webFetch but NOT bash or lsp', () => {
    const { csTools } = buildToolSet(fakeDeps, 'build')
    const names = csTools.map(t => t.name)
    expect(names).toContain('readFile')
    expect(names).toContain('grep')
    expect(names).toContain('glob')
    expect(names).toContain('webFetch')
    expect(names).not.toContain('bash')
    expect(names).not.toContain('lsp')
  })

  it('fix tier includes bash, lsp, readFile, grep, glob but NOT webFetch', () => {
    const { csTools } = buildToolSet(fakeDeps, 'fix')
    const names = csTools.map(t => t.name)
    expect(names).toContain('bash')
    expect(names).toContain('lsp')
    expect(names).toContain('readFile')
    expect(names).toContain('grep')
    expect(names).toContain('glob')
    expect(names).not.toContain('webFetch')
  })

  it('orchestrator tier includes all six new tools', () => {
    const { csTools } = buildToolSet(fakeDeps, 'orchestrator')
    const names = csTools.map(t => t.name)
    for (const name of ['readFile', 'grep', 'glob', 'bash', 'lsp', 'webFetch']) {
      expect(names).toContain(name)
    }
  })

  it('aiTools is a flat map of tool name to AI SDK tool', () => {
    const { aiTools } = buildToolSet(fakeDeps, 'build')
    expect(typeof aiTools).toBe('object')
    expect(Object.keys(aiTools).length).toBeGreaterThan(0)
    for (const tool of Object.values(aiTools)) {
      expect(tool).toHaveProperty('inputSchema')
      expect(tool).toHaveProperty('execute')
    }
  })
})
```

- [ ] **Step 1.2: Run test — verify it fails**

```bash
cd /path/to/worktree && npm test -- --run src/main/agent/tools/__tests__/index.test.ts
```
Expected: FAIL — `buildToolSet` does not accept a `tier` argument yet.

- [ ] **Step 1.3: Update `index.ts`**

Replace the `buildToolSet` function and add the `PermissionBroker` type and `tier` parameter. The new tool imports will fail until later tasks add those files — that's expected; we'll add stubs.

```typescript
// src/main/agent/tools/index.ts
export { validateManifest, validateManifestTool } from './validateManifest'
export { createReviewCodeTool } from './reviewCode'
export { createRenderComponentTool } from './renderComponent'
export { createWriteComponentTool } from './writeComponent'
export { createReadManifestTool } from './readManifest'
export { createReadProjectContextTool } from './readProjectContext'
export { createSearchBlueprintsTool } from './searchBlueprints'
export { createScanLocalComponentsTool } from './scanLocalComponents'
export type { CSTool, ToolResult, ToolUseContext, ValidationResult } from './types'
export { buildTool } from './types'

import type { CSTool } from './types'
import type { CSlateServerClient } from '../../server/CSlateServerClient'
import { validateManifestTool } from './validateManifest'
import { createReviewCodeTool } from './reviewCode'
import { createRenderComponentTool } from './renderComponent'
import { createWriteComponentTool } from './writeComponent'
import { createReadManifestCSTool } from './readManifest'
import { createReadProjectContextCSTool } from './readProjectContext'
import { createSearchBlueprintsCSTool } from './searchBlueprints'
import { createScanLocalComponentsCSTool } from './scanLocalComponents'
import { createReadFileCSTool } from './readFile'
import { createGrepCSTool } from './grep'
import { createGlobCSTool } from './glob'
import { createBashCSTool } from './bash'
import { createLspCSTool } from './lsp'
import { createWebFetchCSTool } from './webFetch'

// PermissionBroker is defined in bash/permissions.ts to avoid circular imports
// (index.ts imports bash.ts which would import back from index.ts)
export type { PermissionBroker } from './bash/permissions'

export type ToolFactoryDeps = {
  projectDir: string
  registry: { languageModel: (id: string) => any }
  fastModelId: string
  serverClient: CSlateServerClient | null
  permissionBroker?: PermissionBroker
}

export type ToolTier = 'build' | 'fix' | 'orchestrator'

export function buildToolSet(
  deps: ToolFactoryDeps,
  tier: ToolTier = 'orchestrator'
): {
  csTools: CSTool[]
  aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>>
} {
  const broker: PermissionBroker = deps.permissionBroker ?? { request: async () => true }

  // Base tools available to all tiers
  const baseTools: CSTool[] = [
    validateManifestTool,
    createReadManifestCSTool(deps.projectDir),
    createReadProjectContextCSTool(deps.projectDir),
  ]

  // Build tier: exploration before writing
  const buildTools: CSTool[] = [
    ...baseTools,
    createSearchBlueprintsCSTool(deps.serverClient),
    createScanLocalComponentsCSTool(deps.projectDir),
    createRenderComponentTool(),
    createWriteComponentTool(deps.projectDir),
    createReviewCodeTool(deps.registry, deps.fastModelId),
    createReadFileCSTool(deps.projectDir),
    createGrepCSTool(deps.projectDir),
    createGlobCSTool(deps.projectDir),
    createWebFetchCSTool(deps.serverClient),
  ]

  // Fix tier: verification + exploration
  const fixTools: CSTool[] = [
    ...baseTools,
    createReadFileCSTool(deps.projectDir),
    createGrepCSTool(deps.projectDir),
    createGlobCSTool(deps.projectDir),
    createBashCSTool(deps.projectDir, broker),
    createLspCSTool(deps.projectDir),
  ]

  // Orchestrator tier: everything
  const orchestratorTools: CSTool[] = [
    ...baseTools,
    createSearchBlueprintsCSTool(deps.serverClient),
    createScanLocalComponentsCSTool(deps.projectDir),
    createRenderComponentTool(),
    createWriteComponentTool(deps.projectDir),
    createReviewCodeTool(deps.registry, deps.fastModelId),
    createReadFileCSTool(deps.projectDir),
    createGrepCSTool(deps.projectDir),
    createGlobCSTool(deps.projectDir),
    createBashCSTool(deps.projectDir, broker),
    createLspCSTool(deps.projectDir),
    createWebFetchCSTool(deps.serverClient),
  ]

  const csTools: CSTool[] =
    tier === 'build' ? buildTools
    : tier === 'fix' ? fixTools
    : orchestratorTools

  const aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>> = {}
  for (const tool of csTools) {
    aiTools[tool.name] = tool.toAISDKTool()
  }

  return { csTools, aiTools }
}
```

Add stub files to make imports resolve (each stub just exports a no-op function):

```typescript
// src/main/agent/tools/readFile.ts (stub)
import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createReadFileCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'readFile', description: 'stub', inputSchema: z.object({ path: z.string() }), call: async () => ({ data: { error: 'stub' } }) })
}
```

```typescript
// src/main/agent/tools/grep.ts (stub)
import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createGrepCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'grep', description: 'stub', inputSchema: z.object({ pattern: z.string() }), call: async () => ({ data: { matches: [] } }) })
}
```

```typescript
// src/main/agent/tools/glob.ts (stub)
import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createGlobCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'glob', description: 'stub', inputSchema: z.object({ pattern: z.string() }), call: async () => ({ data: { files: [] } }) })
}
```

```typescript
// src/main/agent/tools/bash.ts (stub)
import { buildTool, type CSTool } from './types'
import { z } from 'zod'
import type { PermissionBroker } from './bash/permissions'
export function createBashCSTool(_projectDir: string, _broker: PermissionBroker): CSTool {
  return buildTool({ name: 'bash', description: 'stub', inputSchema: z.object({ command: z.string() }), call: async () => ({ data: { stdout: '', stderr: '', exitCode: 0 } }) })
}
```

```typescript
// src/main/agent/tools/lsp.ts (stub)
import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createLspCSTool(_projectDir: string): CSTool {
  return buildTool({ name: 'lsp', description: 'stub', inputSchema: z.object({ files: z.array(z.string()).optional() }), call: async () => ({ data: { diagnostics: [] } }) })
}
```

```typescript
// src/main/agent/tools/webFetch.ts (stub)
import { buildTool, type CSTool } from './types'
import { z } from 'zod'
export function createWebFetchCSTool(_serverClient: any): CSTool {
  return buildTool({ name: 'webFetch', description: 'stub', inputSchema: z.object({ url: z.string().optional(), query: z.string().optional() }), call: async () => ({ data: { content: '', source: 'web' as const } }) })
}
```

Also create `src/main/agent/tools/bash/permissions.ts` and `src/main/agent/tools/bash/executor.ts` as empty stubs (bash.ts imports them).

**Important:** Define `PermissionBroker` in `bash/permissions.ts` (NOT in `index.ts`) to avoid a circular import between `index.ts` ↔ `bash.ts`. `index.ts` re-exports it from there.

```typescript
// src/main/agent/tools/bash/permissions.ts (stub)
export type PermissionDecision = 'allow' | 'prompt' | 'deny'
export type PermissionBroker = { request(command: string): Promise<boolean> }
export function classifyCommand(_command: string): PermissionDecision { return 'allow' }
```
```typescript
// src/main/agent/tools/bash/executor.ts (stub)
export async function execute(_opts: { command: string; cwd: string; timeout: number; abortSignal?: AbortSignal }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return { stdout: '', stderr: '', exitCode: 0 }
}
```

- [ ] **Step 1.4: Run test — verify it passes**

```bash
npm test -- --run src/main/agent/tools/__tests__/index.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 1.5: Commit**

```bash
git add src/main/agent/tools/index.ts src/main/agent/tools/__tests__/index.test.ts \
  src/main/agent/tools/readFile.ts src/main/agent/tools/grep.ts \
  src/main/agent/tools/glob.ts src/main/agent/tools/bash.ts \
  src/main/agent/tools/lsp.ts src/main/agent/tools/webFetch.ts \
  src/main/agent/tools/bash/permissions.ts src/main/agent/tools/bash/executor.ts
git commit -m "feat(tools): add tier system to buildToolSet with stub implementations"
```

---

## Task 2: `readFile` tool

**Files:**
- Create: `src/main/agent/tools/readFile.ts`
- Create: `src/main/agent/tools/__tests__/readFile.test.ts`

- [ ] **Step 2.1: Write failing tests**

```typescript
// src/main/agent/tools/__tests__/readFile.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createReadFileCSTool } from '../readFile'

describe('readFile tool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cslate-readfile-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('reads a file within projectDir', async () => {
    await writeFile(join(tmpDir, 'hello.ts'), 'export const x = 1')
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'hello.ts' })
    expect(result.data).toEqual({ content: 'export const x = 1' })
  })

  it('rejects path traversal', async () => {
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: '../outside.txt' })
    expect(result.data).toHaveProperty('error')
    expect((result.data as any).error).toMatch(/traversal|invalid/i)
  })

  it('returns error for missing file', async () => {
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'nonexistent.ts' })
    expect(result.data).toHaveProperty('error')
  })

  it('reads partial file with lineRange', async () => {
    await writeFile(join(tmpDir, 'lines.ts'), 'line1\nline2\nline3\nline4\nline5')
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'lines.ts', lineRange: { start: 2, end: 3 } })
    expect(result.data).toEqual({ content: 'line2\nline3' })
  })

  it('reads a file in a subdirectory', async () => {
    await mkdir(join(tmpDir, 'components', 'foo'), { recursive: true })
    await writeFile(join(tmpDir, 'components', 'foo', 'ui.tsx'), 'const x = 42')
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'components/foo/ui.tsx' })
    expect(result.data).toEqual({ content: 'const x = 42' })
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createReadFileCSTool(tmpDir)
    expect(tool.isReadOnly({ path: 'any.ts' })).toBe(true)
    expect(tool.isConcurrencySafe({ path: 'any.ts' })).toBe(true)
  })

  it('maxResultSizeChars is 100000', () => {
    const tool = createReadFileCSTool(tmpDir)
    expect(tool.maxResultSizeChars).toBe(100_000)
  })
})
```

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/__tests__/readFile.test.ts
```
Expected: FAIL — stub returns `{ error: 'stub' }` for all calls.

- [ ] **Step 2.3: Implement `readFile.ts`**

```typescript
// src/main/agent/tools/readFile.ts
import { z } from 'zod'
import { readFile as fsReadFile } from 'fs/promises'
import { buildTool, type CSTool } from './types'
import { safePath } from '../../lib/paths'

type ReadFileInput = {
  path: string
  lineRange?: { start: number; end: number }
}
type ReadFileOutput = { content: string } | { error: string }

export function createReadFileCSTool(projectDir: string): CSTool<ReadFileInput, ReadFileOutput> {
  return buildTool<ReadFileInput, ReadFileOutput>({
    name: 'readFile',
    description:
      'Read any file within the project directory. Use path relative to the project root (e.g. "components/foo/ui.tsx"). Optionally scope to a line range.',
    inputSchema: z.object({
      path: z.string().describe('File path relative to project root'),
      lineRange: z
        .object({ start: z.number().int().min(1), end: z.number().int().min(1) })
        .optional()
        .describe('1-indexed inclusive line range to read'),
    }),
    call: async (input: ReadFileInput): Promise<{ data: ReadFileOutput }> => {
      let resolved: string
      try {
        resolved = safePath(projectDir, input.path)
      } catch {
        return { data: { error: `Invalid path: ${input.path}` } }
      }

      let content: string
      try {
        content = await fsReadFile(resolved, 'utf-8')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Cannot read file: ${msg}` } }
      }

      if (input.lineRange) {
        const lines = content.split('\n')
        const start = Math.max(0, input.lineRange.start - 1)
        const end = Math.min(lines.length, input.lineRange.end)
        content = lines.slice(start, end).join('\n')
      }

      return { data: { content } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    maxResultSizeChars: 100_000,
  })
}
```

- [ ] **Step 2.4: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/__tests__/readFile.test.ts
```
Expected: PASS (7 tests)

- [ ] **Step 2.5: Commit**

```bash
git add src/main/agent/tools/readFile.ts src/main/agent/tools/__tests__/readFile.test.ts
git commit -m "feat(tools): implement readFile tool"
```

---

## Task 3: `grep` tool

**Files:**
- Create: `src/main/agent/tools/grep.ts`
- Create: `src/main/agent/tools/__tests__/grep.test.ts`

- [ ] **Step 3.1: Write failing tests**

```typescript
// src/main/agent/tools/__tests__/grep.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createGrepCSTool } from '../grep'

describe('grep tool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cslate-grep-'))
    await writeFile(join(tmpDir, 'a.ts'), 'export const foo = 1\nexport const bar = 2')
    await mkdir(join(tmpDir, 'sub'), { recursive: true })
    await writeFile(join(tmpDir, 'sub', 'b.tsx'), 'function greet() { return "hello" }')
    await writeFile(join(tmpDir, 'notes.txt'), 'foo bar baz')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('finds pattern across project files', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'foo' })
    const data = result.data as { matches: Array<{ file: string; line: number; content: string }> }
    expect(data.matches.length).toBeGreaterThan(0)
    expect(data.matches.some(m => m.file.includes('a.ts'))).toBe(true)
  })

  it('returns empty matches when pattern not found', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'zzznotfound' })
    const data = result.data as { matches: [] }
    expect(data.matches).toEqual([])
  })

  it('scopes search to a glob pattern', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'foo', glob: '*.ts' })
    const data = result.data as { matches: Array<{ file: string }> }
    expect(data.matches.every(m => m.file.endsWith('.ts'))).toBe(true)
    expect(data.matches.some(m => m.file.includes('notes.txt'))).toBe(false)
  })

  it('returns file, line number, and matching content', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'export const foo' })
    const data = result.data as { matches: Array<{ file: string; line: number; content: string }> }
    const match = data.matches[0]
    expect(match).toHaveProperty('file')
    expect(match).toHaveProperty('line')
    expect(match.line).toBe(1)
    expect(match).toHaveProperty('content')
    expect(match.content).toContain('foo')
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createGrepCSTool(tmpDir)
    expect(tool.isReadOnly({ pattern: 'x' })).toBe(true)
    expect(tool.isConcurrencySafe({ pattern: 'x' })).toBe(true)
  })
})
```

- [ ] **Step 3.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/__tests__/grep.test.ts
```
Expected: FAIL

- [ ] **Step 3.3: Implement `grep.ts`**

```typescript
// src/main/agent/tools/grep.ts
import { z } from 'zod'
import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'
import { buildTool, type CSTool } from './types'

type GrepInput = {
  pattern: string
  path?: string
  glob?: string
  caseInsensitive?: boolean
}
type GrepMatch = { file: string; line: number; content: string }
type GrepOutput = { matches: GrepMatch[] } | { error: string }

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true } as any)
  return (entries as any[])
    .filter((e: any) => e.isFile())
    .map((e: any) => join(e.parentPath ?? e.path ?? dir, e.name))
}

function matchesGlob(filePath: string, pattern: string): boolean {
  // Simple glob: supports * (not crossing dirs) and ** (crossing dirs) and extensions
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
  return new RegExp(`(^|/)${escaped}$`).test(filePath)
}

export function createGrepCSTool(projectDir: string): CSTool<GrepInput, GrepOutput> {
  return buildTool<GrepInput, GrepOutput>({
    name: 'grep',
    description:
      'Search for a regex pattern across files in the project. Returns file path, line number, and matching line content. Use glob to filter file types (e.g. "*.tsx").',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Subdirectory to scope search (relative to project root)'),
      glob: z.string().optional().describe('Glob pattern to filter files, e.g. "*.ts" or "**/*.tsx"'),
      caseInsensitive: z.boolean().optional().describe('Case-insensitive matching'),
    }),
    call: async (input: GrepInput): Promise<{ data: GrepOutput }> => {
      const searchRoot = input.path ? join(projectDir, input.path) : projectDir

      let regex: RegExp
      try {
        regex = new RegExp(input.pattern, input.caseInsensitive ? 'i' : '')
      } catch {
        return { data: { error: `Invalid regex: ${input.pattern}` } }
      }

      let files: string[]
      try {
        files = await walkDir(searchRoot)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Cannot read directory: ${msg}` } }
      }

      if (input.glob) {
        files = files.filter(f => matchesGlob(relative(searchRoot, f), input.glob!))
      }

      const matches: GrepMatch[] = []
      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push({
                file: relative(projectDir, filePath),
                line: i + 1,
                content: lines[i].trim(),
              })
            }
          }
        } catch {
          // Skip unreadable files (binary, permissions)
        }
      }

      return { data: { matches } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}
```

- [ ] **Step 3.4: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/__tests__/grep.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 3.5: Commit**

```bash
git add src/main/agent/tools/grep.ts src/main/agent/tools/__tests__/grep.test.ts
git commit -m "feat(tools): implement grep tool"
```

---

## Task 4: `glob` tool

**Files:**
- Create: `src/main/agent/tools/glob.ts`
- Create: `src/main/agent/tools/__tests__/glob.test.ts`

- [ ] **Step 4.1: Write failing tests**

```typescript
// src/main/agent/tools/__tests__/glob.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createGlobCSTool } from '../glob'

describe('glob tool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cslate-glob-'))
    await mkdir(join(tmpDir, 'components', 'button'), { recursive: true })
    await mkdir(join(tmpDir, 'components', 'card'), { recursive: true })
    await writeFile(join(tmpDir, 'components', 'button', 'ui.tsx'), '')
    await writeFile(join(tmpDir, 'components', 'button', 'logic.ts'), '')
    await writeFile(join(tmpDir, 'components', 'card', 'ui.tsx'), '')
    await writeFile(join(tmpDir, 'README.md'), '')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('finds all tsx files', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: '**/*.tsx' })
    const data = result.data as { files: string[] }
    expect(data.files).toHaveLength(2)
    expect(data.files.every((f: string) => f.endsWith('.tsx'))).toBe(true)
  })

  it('finds all files in a specific dir', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: 'components/button/*' })
    const data = result.data as { files: string[] }
    expect(data.files).toHaveLength(2)
    expect(data.files.every((f: string) => f.startsWith('components/button/'))).toBe(true)
  })

  it('returns empty array when no matches', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: '**/*.py' })
    const data = result.data as { files: string[] }
    expect(data.files).toEqual([])
  })

  it('returns paths relative to projectDir', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: '**/*.ts' })
    const data = result.data as { files: string[] }
    expect(data.files.every((f: string) => !f.startsWith('/'))).toBe(true)
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createGlobCSTool(tmpDir)
    expect(tool.isReadOnly({ pattern: '**' })).toBe(true)
    expect(tool.isConcurrencySafe({ pattern: '**' })).toBe(true)
  })
})
```

- [ ] **Step 4.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/__tests__/glob.test.ts
```
Expected: FAIL

- [ ] **Step 4.3: Implement `glob.ts`**

```typescript
// src/main/agent/tools/glob.ts
import { z } from 'zod'
import { readdir } from 'fs/promises'
import { join, relative } from 'path'
import { buildTool, type CSTool } from './types'

type GlobInput = { pattern: string; cwd?: string }
type GlobOutput = { files: string[] } | { error: string }

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true } as any)
  return (entries as any[])
    .filter((e: any) => e.isFile())
    .map((e: any) => join(e.parentPath ?? e.path ?? dir, e.name))
}

export function createGlobCSTool(projectDir: string): CSTool<GlobInput, GlobOutput> {
  return buildTool<GlobInput, GlobOutput>({
    name: 'glob',
    description:
      'Find files in the project by glob pattern. Returns paths relative to project root. Supports * (single dir level) and ** (recursive). E.g. "components/**/*.tsx", "**/*.ts".',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern, e.g. "components/**/*.tsx"'),
      cwd: z.string().optional().describe('Subdirectory to search from (relative to project root). Defaults to project root.'),
    }),
    call: async (input: GlobInput): Promise<{ data: GlobOutput }> => {
      const searchRoot = input.cwd ? join(projectDir, input.cwd) : projectDir
      const regex = globToRegex(input.pattern)

      let allFiles: string[]
      try {
        allFiles = await walkDir(searchRoot)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Cannot read directory: ${msg}` } }
      }

      const matched = allFiles
        .map(f => relative(projectDir, f))
        .filter(f => regex.test(f))

      return { data: { files: matched } }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}
```

- [ ] **Step 4.4: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/__tests__/glob.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 4.5: Commit**

```bash
git add src/main/agent/tools/glob.ts src/main/agent/tools/__tests__/glob.test.ts
git commit -m "feat(tools): implement glob tool"
```

---

## Task 5: `bash/permissions` classifier

**Files:**
- Create: `src/main/agent/tools/bash/permissions.ts`
- Create: `src/main/agent/tools/bash/__tests__/permissions.test.ts`

- [ ] **Step 5.1: Write failing tests**

```typescript
// src/main/agent/tools/bash/__tests__/permissions.test.ts
import { describe, it, expect } from 'vitest'
import { classifyCommand } from '../permissions'

describe('bash permissions classifier', () => {
  it('allows read operations', () => {
    expect(classifyCommand('cat package.json')).toBe('allow')
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('head -20 src/index.ts')).toBe('allow')
    expect(classifyCommand('tail -f logs/app.log')).toBe('allow')
    expect(classifyCommand('pwd')).toBe('allow')
    expect(classifyCommand('echo hello')).toBe('allow')
    expect(classifyCommand('find . -name "*.ts"')).toBe('allow')
  })

  it('allows build and lint commands', () => {
    expect(classifyCommand('tsc --noEmit')).toBe('allow')
    expect(classifyCommand('eslint src/')).toBe('allow')
    expect(classifyCommand('prettier --check src/')).toBe('allow')
    expect(classifyCommand('npm run build')).toBe('allow')
    expect(classifyCommand('npx tsc')).toBe('allow')
  })

  it('allows git read commands', () => {
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git log --oneline')).toBe('allow')
    expect(classifyCommand('git diff HEAD')).toBe('allow')
  })

  it('prompts for destructive file operations', () => {
    expect(classifyCommand('rm -rf dist/')).toBe('prompt')
    expect(classifyCommand('rm file.ts')).toBe('prompt')
    expect(classifyCommand('rmdir old/')).toBe('prompt')
  })

  it('prompts for git write operations', () => {
    expect(classifyCommand('git push origin main')).toBe('prompt')
    expect(classifyCommand('git reset --hard HEAD~1')).toBe('prompt')
    expect(classifyCommand('git checkout -- .')).toBe('prompt')
  })

  it('prompts for network and install commands', () => {
    expect(classifyCommand('npm install lodash')).toBe('prompt')
    expect(classifyCommand('curl https://example.com')).toBe('prompt')
    expect(classifyCommand('wget https://example.com/file')).toBe('prompt')
  })

  it('prompts for process management', () => {
    expect(classifyCommand('kill 1234')).toBe('prompt')
    expect(classifyCommand('pkill node')).toBe('prompt')
  })

  it('denies eval and shell escape', () => {
    expect(classifyCommand('eval "rm -rf /"')).toBe('deny')
    expect(classifyCommand('bash -c "dangerous"')).toBe('deny')
    expect(classifyCommand('sh -c "rm /etc/passwd"')).toBe('deny')
  })

  it('denies access to sensitive files', () => {
    expect(classifyCommand('cat .env')).toBe('deny')
    expect(classifyCommand('cat .env.production')).toBe('deny')
    expect(classifyCommand('cat ~/.ssh/id_rsa')).toBe('deny')
  })
})
```

- [ ] **Step 5.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/bash/__tests__/permissions.test.ts
```
Expected: FAIL — stub always returns 'allow'

- [ ] **Step 5.3: Implement `bash/permissions.ts`**

```typescript
// src/main/agent/tools/bash/permissions.ts

export type PermissionDecision = 'allow' | 'prompt' | 'deny'

const DENY_PATTERNS = [
  /\beval\b/,
  /\bbash\s+-c\b/,
  /\bsh\s+-c\b/,
  /\bzsh\s+-c\b/,
  /\.env(\.[a-z]+)?(['"\s]|$)/,
  /~\/\.ssh\//,
  /\/etc\/passwd/,
  /\/etc\/shadow/,
]

const PROMPT_PATTERNS = [
  /\brm\b/,
  /\brmdir\b/,
  /\bgit\s+(push|reset|checkout\s+--)/,
  /\bnpm\s+install\b/,
  /\byarn\s+add\b/,
  /\bpnpm\s+add\b/,
  /\bcurl\b/,
  /\bwget\b/,
  /\bkill\b/,
  /\bpkill\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bsudo\b/,
]

const ALLOW_PATTERNS = [
  /^(cat|head|tail|ls|find|echo|pwd|wc|sort|uniq|grep|rg|awk|sed|diff|file)\b/,
  /^tsc\b/,
  /^eslint\b/,
  /^prettier\b/,
  /^npm\s+run\b/,
  /^npx\b/,
  /^node\s+-e\b/,
  /^git\s+(status|log|diff|show|branch|remote|fetch|stash\s+list)\b/,
]

export function classifyCommand(command: string): PermissionDecision {
  const trimmed = command.trim()

  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(trimmed)) return 'deny'
  }

  for (const pattern of ALLOW_PATTERNS) {
    if (pattern.test(trimmed)) return 'allow'
  }

  for (const pattern of PROMPT_PATTERNS) {
    if (pattern.test(trimmed)) return 'prompt'
  }

  // Default: prompt for unknown commands
  return 'prompt'
}
```

- [ ] **Step 5.4: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/bash/__tests__/permissions.test.ts
```
Expected: PASS (9 tests)

- [ ] **Step 5.5: Commit**

```bash
git add src/main/agent/tools/bash/permissions.ts src/main/agent/tools/bash/__tests__/permissions.test.ts
git commit -m "feat(tools): implement bash permissions classifier"
```

---

## Task 6: `bash` tool (executor + integration)

**Files:**
- Create: `src/main/agent/tools/bash/executor.ts`
- Create: `src/main/agent/tools/bash.ts`
- Create: `src/main/agent/tools/bash/__tests__/bash.test.ts`

- [ ] **Step 6.1: Write failing tests**

```typescript
// src/main/agent/tools/bash/__tests__/bash.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBashCSTool } from '../bash'
import type { PermissionBroker } from '../index'

// Mock executor so tests don't actually spawn processes
vi.mock('../bash/executor', () => ({
  execute: vi.fn(),
}))
import { execute } from '../bash/executor'
const mockExecute = vi.mocked(execute)

describe('bash tool', () => {
  const projectDir = '/tmp/test-project'
  const allowBroker: PermissionBroker = { request: async () => true }
  const denyBroker: PermissionBroker = { request: async () => false }

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
  })

  it('runs an allowed command without consulting broker', async () => {
    const tool = createBashCSTool(projectDir, denyBroker)
    const result = await tool.call({ command: 'tsc --noEmit' })
    const data = result.data as { stdout: string; stderr: string; exitCode: number }
    expect(data.stdout).toBe('ok')
    // broker was never asked because tsc is auto-allowed
  })

  it('consults broker for prompt-category commands', async () => {
    const brokerSpy = vi.fn().mockResolvedValue(true)
    const broker: PermissionBroker = { request: brokerSpy }
    const tool = createBashCSTool(projectDir, broker)
    await tool.call({ command: 'rm dist/index.js' })
    expect(brokerSpy).toHaveBeenCalledWith('rm dist/index.js')
    expect(mockExecute).toHaveBeenCalled()
  })

  it('does not execute when broker denies', async () => {
    const tool = createBashCSTool(projectDir, denyBroker)
    const result = await tool.call({ command: 'rm dist/index.js' })
    const data = result.data as { error: string }
    expect(data).toHaveProperty('error')
    expect(data.error).toMatch(/denied/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-denies dangerous commands without consulting broker', async () => {
    const brokerSpy = vi.fn()
    const tool = createBashCSTool(projectDir, { request: brokerSpy })
    const result = await tool.call({ command: 'eval "rm -rf /"' })
    const data = result.data as { error: string }
    expect(data).toHaveProperty('error')
    expect(brokerSpy).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('passes projectDir as default cwd to executor', async () => {
    const tool = createBashCSTool(projectDir, allowBroker)
    await tool.call({ command: 'tsc --noEmit' })
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: projectDir })
    )
  })

  it('is NOT read-only and NOT concurrency-safe', () => {
    const tool = createBashCSTool(projectDir, allowBroker)
    expect(tool.isReadOnly({ command: 'echo hi' })).toBe(false)
    expect(tool.isConcurrencySafe({ command: 'echo hi' })).toBe(false)
  })
})
```

- [ ] **Step 6.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/bash/__tests__/bash.test.ts
```
Expected: FAIL — stub always succeeds regardless of permission

- [ ] **Step 6.3: Implement `bash/executor.ts`**

```typescript
// src/main/agent/tools/bash/executor.ts
import { spawn } from 'child_process'

type ExecuteOptions = {
  command: string
  cwd: string
  timeout: number
  abortSignal?: AbortSignal
}
type ExecuteResult = { stdout: string; stderr: string; exitCode: number }

export async function execute(opts: ExecuteOptions): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', opts.command], {
      cwd: opts.cwd,
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    const MAX = 100_000

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > MAX) stdout = stdout.slice(0, MAX) + '\n[truncated]'
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      if (stderr.length > MAX) stderr = stderr.slice(0, MAX) + '\n[truncated]'
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${opts.timeout}ms`))
    }, opts.timeout)

    if (opts.abortSignal) {
      opts.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
        reject(new Error('Command aborted'))
      })
    }

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
```

- [ ] **Step 6.4: Implement `bash.ts`**

```typescript
// src/main/agent/tools/bash.ts
import { z } from 'zod'
import { buildTool, type CSTool } from './types'
import { classifyCommand } from './bash/permissions'
import { execute } from './bash/executor'
import type { PermissionBroker } from './bash/permissions'

type BashInput = { command: string; cwd?: string; timeout?: number }
type BashOutput =
  | { stdout: string; stderr: string; exitCode: number }
  | { error: string }

export function createBashCSTool(
  projectDir: string,
  broker: PermissionBroker
): CSTool<BashInput, BashOutput> {
  return buildTool<BashInput, BashOutput>({
    name: 'bash',
    description:
      'Run a shell command in the project directory. Safe commands (tsc, eslint, git status) run immediately. Destructive commands prompt the user for approval. Commands writing outside the project directory are auto-denied.',
    inputSchema: z.object({
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().optional().describe('Working directory relative to project root (defaults to project root)'),
      timeout: z.number().int().min(1000).max(120_000).optional().describe('Timeout in ms (default 30000, max 120000)'),
    }),
    call: async (input: BashInput, context): Promise<{ data: BashOutput }> => {
      const decision = classifyCommand(input.command)

      if (decision === 'deny') {
        return { data: { error: `Command denied: "${input.command}" is not permitted.` } }
      }

      if (decision === 'prompt') {
        const approved = await broker.request(input.command)
        if (!approved) {
          return { data: { error: `Command denied by user: "${input.command}"` } }
        }
      }

      const cwd = input.cwd ? `${projectDir}/${input.cwd}` : projectDir
      const timeout = input.timeout ?? 30_000

      try {
        const result = await execute({
          command: input.command,
          cwd,
          timeout,
          abortSignal: context?.abortSignal,
        })
        return { data: result }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: msg } }
      }
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    maxResultSizeChars: 100_000,
  })
}
```

- [ ] **Step 6.5: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/bash/__tests__/bash.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 6.6: Commit**

```bash
git add src/main/agent/tools/bash.ts src/main/agent/tools/bash/executor.ts \
  src/main/agent/tools/bash/__tests__/bash.test.ts
git commit -m "feat(tools): implement bash tool with permission broker"
```

---

## Task 7: `lsp` tool

**Files:**
- Create: `src/main/agent/tools/lsp.ts`
- Create: `src/main/agent/tools/__tests__/lsp.test.ts`

- [ ] **Step 7.1: Write failing tests**

```typescript
// src/main/agent/tools/__tests__/lsp.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLspCSTool } from '../lsp'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))
import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

function makeChildProcess(stdout: string, exitCode: number = 0) {
  const EventEmitter = require('events')
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  setTimeout(() => {
    child.stdout.emit('data', Buffer.from(stdout))
    child.emit('close', exitCode)
  }, 0)
  return child
}

describe('lsp tool', () => {
  const projectDir = '/tmp/fake-project'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty diagnostics when tsc exits 0', async () => {
    mockSpawn.mockReturnValue(makeChildProcess('', 0) as any)
    const tool = createLspCSTool(projectDir)
    const result = await tool.call({})
    expect(result.data).toEqual({ diagnostics: [] })
  })

  it('parses tsc error output into structured diagnostics', async () => {
    const tscOutput = `src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar.ts(3,1): warning TS7006: Parameter 'x' implicitly has an 'any' type.`
    mockSpawn.mockReturnValue(makeChildProcess(tscOutput, 1) as any)

    const tool = createLspCSTool(projectDir)
    const result = await tool.call({})
    const data = result.data as { diagnostics: any[] }

    expect(data.diagnostics).toHaveLength(2)
    expect(data.diagnostics[0]).toEqual({
      file: 'src/foo.ts',
      line: 10,
      col: 5,
      message: "TS2322: Type 'string' is not assignable to type 'number'.",
      severity: 'error',
    })
    expect(data.diagnostics[1].severity).toBe('warning')
  })

  it('scopes diagnostics to specific files when provided', async () => {
    const tscOutput = `src/foo.ts(10,5): error TS2322: some error.
src/bar.ts(3,1): error TS7006: other error.`
    mockSpawn.mockReturnValue(makeChildProcess(tscOutput, 1) as any)

    const tool = createLspCSTool(projectDir)
    const result = await tool.call({ files: ['src/foo.ts'] })
    const data = result.data as { diagnostics: any[] }

    expect(data.diagnostics).toHaveLength(1)
    expect(data.diagnostics[0].file).toBe('src/foo.ts')
  })

  it('is read-only but NOT concurrency-safe', () => {
    const tool = createLspCSTool(projectDir)
    expect(tool.isReadOnly({})).toBe(true)
    expect(tool.isConcurrencySafe({})).toBe(false)
  })
})
```

- [ ] **Step 7.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/__tests__/lsp.test.ts
```
Expected: FAIL

- [ ] **Step 7.3: Implement `lsp.ts`**

```typescript
// src/main/agent/tools/lsp.ts
import { z } from 'zod'
import { spawn } from 'child_process'
import { buildTool, type CSTool } from './types'

type LspInput = { files?: string[] }
type Diagnostic = { file: string; line: number; col: number; message: string; severity: 'error' | 'warning' }
type LspOutput = { diagnostics: Diagnostic[] } | { error: string }

const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+:.+)$/

function parseTscOutput(output: string, scopeFiles?: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const line of output.split('\n')) {
    const match = TSC_LINE.exec(line.trim())
    if (!match) continue
    const [, file, lineStr, colStr, severity, message] = match
    if (scopeFiles && !scopeFiles.includes(file)) continue
    diagnostics.push({
      file,
      line: parseInt(lineStr, 10),
      col: parseInt(colStr, 10),
      message,
      severity: severity as 'error' | 'warning',
    })
  }
  return diagnostics
}

function runTsc(projectDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd: projectDir,
      env: { ...process.env },
    })
    let output = ''
    child.stdout.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr.on('data', (d: Buffer) => { output += d.toString() })
    child.on('close', () => resolve(output))
    child.on('error', reject)
  })
}

export function createLspCSTool(projectDir: string): CSTool<LspInput, LspOutput> {
  return buildTool<LspInput, LspOutput>({
    name: 'lsp',
    description:
      'Run TypeScript type checking (tsc --noEmit) on the project and return structured diagnostics. Use after writing or fixing a file to verify there are no type errors. Optionally scope to specific files.',
    inputSchema: z.object({
      files: z.array(z.string()).optional().describe('Scope diagnostics to these file paths (relative to project root). Omit to check all files.'),
    }),
    call: async (input: LspInput): Promise<{ data: LspOutput }> => {
      try {
        const output = await runTsc(projectDir)
        const diagnostics = parseTscOutput(output, input.files)
        return { data: { diagnostics } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `tsc failed to run: ${msg}` } }
      }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => false,
  })
}
```

- [ ] **Step 7.4: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/__tests__/lsp.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 7.5: Commit**

```bash
git add src/main/agent/tools/lsp.ts src/main/agent/tools/__tests__/lsp.test.ts
git commit -m "feat(tools): implement lsp tool"
```

---

## Task 8: `webFetch` tool

**Files:**
- Create: `src/main/agent/tools/webFetch.ts`
- Create: `src/main/agent/tools/__tests__/webFetch.test.ts`

- [ ] **Step 8.1: Write failing tests**

```typescript
// src/main/agent/tools/__tests__/webFetch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWebFetchCSTool } from '../webFetch'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock searchBlueprints server client
const mockServerClient = {
  searchBlueprints: vi.fn(),
}

describe('webFetch tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches CSlate server first when query is provided', async () => {
    mockServerClient.searchBlueprints.mockResolvedValue([{ name: 'Button', description: 'A button' }])
    const tool = createWebFetchCSTool(mockServerClient as any)
    const result = await tool.call({ query: 'button component' })
    const data = result.data as { content: string; source: string }
    expect(mockServerClient.searchBlueprints).toHaveBeenCalledWith('button component')
    expect(data.source).toBe('cslate-server')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('falls back to DuckDuckGo when server returns empty results', async () => {
    mockServerClient.searchBlueprints.mockResolvedValue([])
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ AbstractText: 'A button is a UI element.' }),
      text: async () => '',
    })
    const tool = createWebFetchCSTool(mockServerClient as any)
    const result = await tool.call({ query: 'what is a button' })
    const data = result.data as { content: string; source: string }
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('duckduckgo'))
    expect(data.source).toBe('web')
  })

  it('fetches a direct URL bypassing CSlate server', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body><main>Hello world</main></body></html>',
    })
    const tool = createWebFetchCSTool(null)
    const result = await tool.call({ url: 'https://example.com/docs' })
    const data = result.data as { content: string; source: string }
    expect(data.source).toBe('web')
    expect(mockServerClient.searchBlueprints).not.toHaveBeenCalled()
  })

  it('strips HTML from fetched pages', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '<html><body><p>Hello <b>world</b></p></body></html>',
    })
    const tool = createWebFetchCSTool(null)
    const result = await tool.call({ url: 'https://example.com' })
    const data = result.data as { content: string }
    expect(data.content).not.toContain('<html>')
    expect(data.content).not.toContain('<b>')
    expect(data.content).toContain('Hello')
    expect(data.content).toContain('world')
  })

  it('returns error when no url or query provided', async () => {
    const tool = createWebFetchCSTool(null)
    const result = await tool.call({})
    expect(result.data).toHaveProperty('error')
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createWebFetchCSTool(null)
    expect(tool.isReadOnly({})).toBe(true)
    expect(tool.isConcurrencySafe({})).toBe(true)
  })
})
```

- [ ] **Step 8.2: Run tests — verify they fail**

```bash
npm test -- --run src/main/agent/tools/__tests__/webFetch.test.ts
```
Expected: FAIL

- [ ] **Step 8.3: Implement `webFetch.ts`**

```typescript
// src/main/agent/tools/webFetch.ts
import { z } from 'zod'
import { buildTool, type CSTool } from './types'
import type { CSlateServerClient } from '../../server/CSlateServerClient'

type WebFetchInput = { url?: string; query?: string }
type WebFetchOutput = { content: string; source: 'cslate-server' | 'web' } | { error: string }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function createWebFetchCSTool(serverClient: CSlateServerClient | null): CSTool<WebFetchInput, WebFetchOutput> {
  return buildTool<WebFetchInput, WebFetchOutput>({
    name: 'webFetch',
    description:
      'Fetch documentation or search for information. When given a query, searches the CSlate blueprint server first, then falls back to the web. When given a direct URL, fetches and returns the page content as plain text.',
    inputSchema: z.object({
      url: z.string().optional().describe('Direct URL to fetch. Bypasses CSlate server.'),
      query: z.string().optional().describe('Search query. Tries CSlate server first, then web.'),
    }),
    call: async (input: WebFetchInput): Promise<{ data: WebFetchOutput }> => {
      if (!input.url && !input.query) {
        return { data: { error: 'Provide either url or query.' } }
      }

      // Direct URL path
      if (input.url) {
        try {
          const resp = await fetch(input.url)
          const html = await resp.text()
          const content = stripHtml(html).slice(0, 50_000)
          return { data: { content, source: 'web' } }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { data: { error: `Fetch failed: ${msg}` } }
        }
      }

      // Query path: CSlate server first
      if (serverClient) {
        try {
          const results = await (serverClient as any).searchBlueprints(input.query!)
          if (results && results.length > 0) {
            const content = results
              .map((r: any) => `${r.name}: ${r.description ?? ''}`)
              .join('\n')
            return { data: { content, source: 'cslate-server' } }
          }
        } catch {
          // Server unavailable — fall through to web
        }
      }

      // Fallback: DuckDuckGo instant answer
      try {
        const encoded = encodeURIComponent(input.query!)
        const resp = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1`)
        const json = await resp.json() as any
        const content = json.AbstractText
          || json.Answer
          || json.RelatedTopics?.[0]?.Text
          || `No results found for: ${input.query}`
        return { data: { content: String(content).slice(0, 50_000), source: 'web' } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Web search failed: ${msg}` } }
      }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}
```

- [ ] **Step 8.4: Run tests — verify they pass**

```bash
npm test -- --run src/main/agent/tools/__tests__/webFetch.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 8.5: Commit**

```bash
git add src/main/agent/tools/webFetch.ts src/main/agent/tools/__tests__/webFetch.test.ts
git commit -m "feat(tools): implement webFetch tool with CSlate server priority"
```

---

## Task 9: IPC permission channels + broker

**Files:**
- Modify: `src/preload/channels.ts`
- Modify: `src/main/agent/ipc.ts`

- [ ] **Step 9.1: Add IPC channels**

In `src/preload/channels.ts`, add two new entries:

```typescript
// In ALLOWED_LISTEN_CHANNELS — main sends this to renderer (show permission dialog)
'agent:permission-request',

// In ALLOWED_INVOKE_CHANNELS — renderer sends response back to main
'agent:permission-response',
```

Full updated `channels.ts`:

```typescript
export const ALLOWED_SEND_CHANNELS = [
  'bridge:fetch',
  'bridge:subscribe',
  'bridge:unsubscribe',
  'sandbox:load',
  'sandbox:unload'
] as const

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
  'app:get-version',
  'window:set-title',
  'agent:run',
  'agent:permission-response',
  'server:search',
  'server:publish',
  'shell:openExternal',
  'models:fetch',
  'canvas:load'
] as const

export const ALLOWED_LISTEN_CHANNELS = [
  'bridge:fetch:resp',
  'bridge:event',
  'sandbox:load:resp',
  'sandbox:error',
  'agent:token',
  'agent:tool-call',
  'agent:tool-result',
  'agent:done',
  'agent:error',
  'agent:orchestrator:status',
  'agent:build:start',
  'agent:build:plan',
  'agent:build:partial',
  'agent:permission-request'
] as const

export type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
export type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
export type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]
```

- [ ] **Step 9.2: Implement PermissionBroker in agent IPC handler**

Read `src/main/agent/ipc.ts` first to understand the existing handler structure, then add the broker.

The broker implementation should be added inside the `agent:run` IPC handler, before the engine is created. Add to the top of the handler:

```typescript
// Inside the agent:run handler, after const { message, projectDir, tabId, ... } = args

// ---- Permission broker for bash tool ----
const pendingPermissions = new Map<string, (approved: boolean) => void>()

// Handler for renderer's approve/deny response
const permissionResponseHandler = ipcMain.handle(
  'agent:permission-response',
  (_evt, { requestId, approved }: { requestId: string; approved: boolean }) => {
    const resolve = pendingPermissions.get(requestId)
    if (resolve) {
      pendingPermissions.delete(requestId)
      resolve(approved)
    }
  }
)

const permissionBroker: PermissionBroker = {
  request(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2)}`
      pendingPermissions.set(requestId, resolve)
      // Send request to renderer — renderer shows a confirmation dialog
      event.sender.send('agent:permission-request', { requestId, command })
      // Auto-deny if no response within 30 seconds
      setTimeout(() => {
        if (pendingPermissions.has(requestId)) {
          pendingPermissions.delete(requestId)
          resolve(false)
        }
      }, 30_000)
    })
  },
}
```

Also add `PermissionBroker` to the import from `tools/index`:
```typescript
import { buildToolSet, type PermissionBroker } from './tools/index'
```

Pass `permissionBroker` in the `ToolFactoryDeps` when calling `buildToolSet`.

Clean up the `permissionResponseHandler` at the end of the agent run (alongside other cleanup):
```typescript
ipcMain.removeHandler('agent:permission-response')
```

- [ ] **Step 9.3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors in `channels.ts` or `ipc.ts`

- [ ] **Step 9.4: Commit**

```bash
git add src/preload/channels.ts src/main/agent/ipc.ts
git commit -m "feat(ipc): add permission request/response channels for bash tool"
```

---

## Task 10: Wire tools into sub-agents

**Files:**
- Modify: `src/main/agent/orchestrator/sub-agent.ts`

- [ ] **Step 10.1: Write failing test for tool-equipped build agent**

Add to `src/main/agent/orchestrator/__tests__/sub-agent.test.ts` (find the existing test file and add cases):

```typescript
it('spawnBuildAgent accepts and passes aiTools to generateText', async () => {
  // The existing test mocks generateText. This test verifies that when aiTools
  // is provided, it's passed through to generateText as the tools param.
  // The mock in the existing test file captures the generateText call args.
  // Add assertion: when aiTools is passed, generateText is called with tools property.
  const fakeTools = { readFile: { inputSchema: {}, execute: vi.fn() } }
  await spawnBuildAgent({
    task: { file: 'ui.tsx', assignment: 'build a button', blueprint: null },
    contract: 'type Props = {}',
    modelId: 'test-model',
    registry: mockRegistry,
    aiTools: fakeTools,
  })
  expect(mockGenerateText).toHaveBeenCalledWith(
    expect.objectContaining({ tools: fakeTools, maxSteps: 8 })
  )
})
```

- [ ] **Step 10.2: Run test — verify it fails**

```bash
npm test -- --run src/main/agent/orchestrator/__tests__/sub-agent.test.ts
```
Expected: FAIL — `spawnBuildAgent` doesn't accept `aiTools`

- [ ] **Step 10.3: Update `sub-agent.ts`**

Add `aiTools` to both `spawnBuildAgent` and `spawnFixAgent` params, increase `maxOutputTokens`, add `maxSteps`:

```typescript
export async function spawnBuildAgent(params: {
  task: BuildTask
  contract: string
  modelId: string
  registry: { languageModel: (id: string) => any }
  aiTools?: Record<string, any>
}): Promise<SubAgentResult> {
  const { task, contract, modelId, registry, aiTools } = params
  log.info({ file: task.file, hasBlueprint: !!task.blueprint, hasTools: !!aiTools }, 'build agent spawned')
  const t0 = Date.now()

  try {
    const prompt = buildSubAgentPrompt({ task, contract })
    const { text } = await generateText({
      model: registry.languageModel(modelId),
      system: BUILD_SYSTEM,
      prompt,
      ...(aiTools && Object.keys(aiTools).length > 0 ? { tools: aiTools, maxSteps: 8 } : {}),
      maxOutputTokens: 12000,
    })

    log.info({ file: task.file, durationMs: Date.now() - t0 }, 'build agent done')
    return { file: task.file, code: stripFences(text), status: 'success', error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ file: task.file, err: msg }, 'build agent failed')
    return { file: task.file, code: '', status: 'error', error: msg }
  }
}

export async function spawnFixAgent(params: {
  file: string
  brokenCode: string
  error: string
  contract: string
  modelId: string
  registry: { languageModel: (id: string) => any }
  aiTools?: Record<string, any>
}): Promise<SubAgentResult> {
  const { file, brokenCode, error, contract, modelId, registry, aiTools } = params
  log.info({ file, error, hasTools: !!aiTools }, 'fix agent spawned')
  const t0 = Date.now()

  try {
    const prompt = `## CONTRACT:\n\`\`\`typescript\n${contract}\n\`\`\`\n\n## BROKEN CODE (file: ${file}):\n\`\`\`\n${brokenCode}\n\`\`\`\n\n## ERROR:\n${error}\n\nUse the available tools to explore the codebase and verify your fix. Return ONLY the corrected file content.`

    const { text } = await generateText({
      model: registry.languageModel(modelId),
      system: FIX_SYSTEM,
      prompt,
      ...(aiTools && Object.keys(aiTools).length > 0 ? { tools: aiTools, maxSteps: 8 } : {}),
      maxOutputTokens: 12000,
    })

    log.info({ file, durationMs: Date.now() - t0 }, 'fix agent done')
    return { file, code: stripFences(text), status: 'success', error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ file, err: msg }, 'fix agent failed')
    return { file, code: '', status: 'error', error: msg }
  }
}
```

Also update `BUILD_SYSTEM` to mention available tools:

```typescript
const BUILD_SYSTEM = `You are a CSlate component file builder. You produce ONE file of production-quality React/TypeScript code for the CSlate platform.

Rules:
- Return ONLY the file content — no markdown fences, no explanations, no preamble.
- Follow the contract exactly. Do not add props or types not in the contract.
- Follow all platform rules below.
- You have exploration tools available (readFile, grep, glob, webFetch). Use them to read existing components for patterns, find type definitions, or fetch documentation before writing.

${PLATFORM_KNOWLEDGE}`

const FIX_SYSTEM = `You are a CSlate component fixer. You receive broken code and an error message. Fix the code and return ONLY the fixed file content — no markdown fences, no explanations.

- Use bash and lsp to verify your fix compiles before returning.
- Use readFile, grep, or glob to explore the codebase for context if needed.

${PLATFORM_KNOWLEDGE}`
```

- [ ] **Step 10.4: Run all sub-agent tests**

```bash
npm test -- --run src/main/agent/orchestrator/__tests__/sub-agent.test.ts
```
Expected: PASS (all tests including new one)

- [ ] **Step 10.5: Commit**

```bash
git add src/main/agent/orchestrator/sub-agent.ts
git commit -m "feat(agent): wire tier tools into build and fix sub-agents"
```

---

## Task 11: Wire tools into orchestrator

**Files:**
- Modify: `src/main/agent/orchestrator/index.ts`

- [ ] **Step 11.1: Add new tool imports to orchestrator**

At the top of `src/main/agent/orchestrator/index.ts`, add after the existing tool imports:

```typescript
import { createReadFileCSTool } from '../tools/readFile'
import { createGrepCSTool } from '../tools/grep'
import { createGlobCSTool } from '../tools/glob'
import { createBashCSTool } from '../tools/bash'
import { createLspCSTool } from '../tools/lsp'
import { createWebFetchCSTool } from '../tools/webFetch'
```

- [ ] **Step 11.2: Register new tools in the orchestrator's `streamText` call**

Find the `streamText({` call in `index.ts`. Add the six new tools alongside the existing ones. The tools are declared as `defineTool()` calls in the orchestrator. Add these in the `tools:` object:

```typescript
readFile: createReadFileCSTool(ctx.projectDir).toAISDKTool(),
grep: createGrepCSTool(ctx.projectDir).toAISDKTool(),
glob: createGlobCSTool(ctx.projectDir).toAISDKTool(),
bash: createBashCSTool(ctx.projectDir, ctx.permissionBroker ?? { request: async () => true }).toAISDKTool(),
lsp: createLspCSTool(ctx.projectDir).toAISDKTool(),
webFetch: createWebFetchCSTool(ctx.serverClient).toAISDKTool(),
```

Also add `permissionBroker` to `OrchestratorContext` in `src/main/agent/orchestrator/types.ts`:

```typescript
permissionBroker?: { request(command: string): Promise<boolean> }
```

Pass `permissionBroker` from the engine to the orchestrator context in `src/main/agent/engine.ts` where `OrchestratorContext` is constructed.

- [ ] **Step 11.3: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Step 11.4: Run all tests**

```bash
npm test
```
Expected: all 276+ tests pass (new tests added: readFile×7 + grep×5 + glob×5 + permissions×9 + bash×6 + lsp×4 + webFetch×6 + index×4 + subAgent×1 = 47 new tests → ~323 total)

- [ ] **Step 11.5: Final commit**

```bash
git add src/main/agent/orchestrator/index.ts src/main/agent/orchestrator/types.ts src/main/agent/engine.ts
git commit -m "feat(orchestrator): register coding tools in orchestrator streamText"
```

---

## Task 12: Spec self-check

- [ ] **Verify all 6 new tools appear in the correct tiers**

```bash
npm test -- --run src/main/agent/tools/__tests__/index.test.ts
```
Expected: PASS (4 tests)

- [ ] **Run full test suite one more time**

```bash
npm test
```
Expected: all tests pass, 0 failures

- [ ] **Run typecheck**

```bash
npm run typecheck
```
Expected: no errors

- [ ] **Final commit if any fixes needed, then tag done**

```bash
git log --oneline feature/coding-agent-skills ^main
```
Should show ~12 commits from this branch.
