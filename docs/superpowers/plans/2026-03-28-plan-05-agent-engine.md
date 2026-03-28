# Plan 05: AI Agent Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CSlate AI agent engine — Vercel AI SDK + custom skill router that takes a user message and produces a streamed, rendered component end-to-end.

**Architecture:** Vercel AI SDK handles all LLM calls with multi-provider support via a registry. A thin `AgentEngine` class orchestrates: intent parsing → skill selection → memory context loading → `streamText` agent loop with parallel tool execution → IPC streaming → memory writes. Skills are plain config objects with specialized system prompts and tool subsets. Sub-agents fire inside tool `execute()` for code review.

**Tech Stack:** `ai` (Vercel AI SDK v6), `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `ollama-ai-provider`, Zod (already installed), `@cslate/shared` (already installed), Vitest (already configured with `node` environment for `src/main/**`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/main/index.ts` | Modify | Register Plan 02 IPC handlers + agent IPC |
| `src/preload/channels.ts` | Modify | Add agent IPC channels |
| `src/main/agent/providers.ts` | Create | Vercel AI SDK provider registry builder |
| `src/main/agent/intent.ts` | Create | parseIntent() — fast structured-output LLM call |
| `src/main/agent/memory/index.ts` | Create | Read/write agent memory markdown files |
| `src/main/agent/memory/context-builder.ts` | Create | Assemble memory into compact context string |
| `src/main/agent/tools/renderComponent.ts` | Create | Tool: load component into sandbox iframe via IPC |
| `src/main/agent/tools/writeComponent.ts` | Create | Tool: persist component package to disk |
| `src/main/agent/tools/readManifest.ts` | Create | Tool: read a component's manifest.json |
| `src/main/agent/tools/searchBlueprints.ts` | Create | Tool: query CSlate Server for matching blueprints |
| `src/main/agent/tools/readProjectContext.ts` | Create | Tool: read project manifest + all component manifests |
| `src/main/agent/tools/validateManifest.ts` | Create | Tool: validate manifest against @cslate/shared schema |
| `src/main/agent/tools/reviewCode.ts` | Create | Sub-agent tool: spawn isolated review LLM call |
| `src/main/agent/tools/index.ts` | Create | Re-export all tools |
| `src/main/agent/skills/types.ts` | Create | SkillConfig interface + AgentContext type |
| `src/main/agent/skills/component-builder.ts` | Create | Skill: generate new component package |
| `src/main/agent/skills/component-modifier.ts` | Create | Skill: modify existing component |
| `src/main/agent/skills/manifest-generator.ts` | Create | Skill: create/fix component manifest |
| `src/main/agent/skills/component-search.ts` | Create | Skill: search community blueprints |
| `src/main/agent/skills/state-wirer.ts` | Create | Skill: wire components via Zustand + event bus |
| `src/main/agent/skills/feedback-iterator.ts` | Create | Skill: iterate component from user feedback |
| `src/main/agent/skills/style-applier.ts` | Create | Skill: restyle component with Tailwind tokens |
| `src/main/agent/skills/index.ts` | Create | Skill registry map |
| `src/main/agent/engine.ts` | Create | AgentEngine class — main orchestrator |
| `src/main/agent/ipc.ts` | Create | Register agent:run IPC handler |

---

## Task 0: Wire Plan 02 IPC Handlers into main/index.ts

Plan 02 created `src/main/ipc/{config,project,file,window}.ts` but never registered them in `index.ts`. Fix that now so Plan 05 can build on top.

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Update src/main/index.ts to register all IPC handlers**

```typescript
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { register as registerConfig } from './ipc/config'
import { register as registerProject } from './ipc/project'
import { register as registerFile } from './ipc/file'

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (is.dev) {
    win.webContents.openDevTools()
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  installCSP()
  registerConfig(ipcMain)
  registerProject(ipcMain)
  registerFile(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "fix: register Plan 02 IPC handlers in main process"
```

---

## Task 1: Install AI SDK Packages

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install Vercel AI SDK + provider packages**

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google ollama-ai-provider
```

- [ ] **Step 2: Verify packages installed**

```bash
ls node_modules | grep -E "^ai$|ai-sdk|ollama-ai"
```

Expected output includes: `ai`, `@ai-sdk` (directory), `ollama-ai-provider`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Vercel AI SDK and provider packages"
```

---

## Task 2: Provider Registry

**Files:**
- Create: `src/main/agent/providers.ts`
- Create: `src/main/agent/__tests__/providers.test.ts`

The provider registry maps user config (provider name + api key) to a Vercel AI `LanguageModel`. Uses `createProviderRegistry` so models are referenced as `"anthropic:claude-sonnet-4-6"`.

- [ ] **Step 1: Write the failing test**

`src/main/agent/__tests__/providers.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => ({ type: 'provider', name: 'anthropic' }))
}))
vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({ type: 'provider', name: 'openai' }))
}))
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => ({ type: 'provider', name: 'google' }))
}))
vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => ({ type: 'provider', name: 'local' }))
}))
vi.mock('ai', () => ({
  createProviderRegistry: vi.fn((providers) => ({
    languageModel: (id: string) => {
      const [prefix] = id.split(':')
      return providers[prefix]
    }
  }))
}))

import { buildRegistry } from '../providers'

describe('buildRegistry', () => {
  it('builds registry for anthropic provider', () => {
    const registry = buildRegistry({ provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6' })
    const model = registry.languageModel('anthropic:claude-sonnet-4-6')
    expect(model).toBeDefined()
  })

  it('builds registry for openai provider', () => {
    const registry = buildRegistry({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' })
    const model = registry.languageModel('openai:gpt-4o')
    expect(model).toBeDefined()
  })

  it('builds registry for local ollama provider', () => {
    const registry = buildRegistry({ provider: 'local', baseUrl: 'http://localhost:11434', model: 'llama3' })
    const model = registry.languageModel('local:llama3')
    expect(model).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- providers
```

Expected: FAIL — `Cannot find module '../providers'`

- [ ] **Step 3: Create src/main/agent/providers.ts**

```typescript
import { createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { createOllama } from 'ollama-ai-provider'

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'local'
  apiKey?: string
  model: string
  baseUrl?: string
  // Optional fast model for intent parsing and review sub-agents
  fastModel?: string
}

export function buildRegistry(config: LLMConfig) {
  return createProviderRegistry({
    anthropic: anthropic({ apiKey: config.apiKey }),
    openai: openai({ apiKey: config.apiKey }),
    google: google({ apiKey: config.apiKey }),
    local: createOllama({ baseURL: config.baseUrl ?? 'http://localhost:11434' }),
  })
}

export function mainModelId(config: LLMConfig): string {
  return `${config.provider}:${config.model}`
}

export function fastModelId(config: LLMConfig): string {
  if (config.fastModel) return `${config.provider}:${config.fastModel}`
  // Sensible fast-model defaults per provider
  const defaults: Record<LLMConfig['provider'], string> = {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4o-mini',
    google: 'gemini-1.5-flash',
    local: config.model,
  }
  return `${config.provider}:${defaults[config.provider]}`
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- providers
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/providers.ts src/main/agent/__tests__/providers.test.ts
git commit -m "feat: add LLM provider registry builder"
```

---

## Task 3: Intent Parsing

**Files:**
- Create: `src/main/agent/intent.ts`
- Create: `src/main/agent/__tests__/intent.test.ts`

A fast structured-output LLM call that classifies the user's message into a skill name + optional target component.

- [ ] **Step 1: Write the failing test**

`src/main/agent/__tests__/intent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn()
}))

import { generateObject } from 'ai'
import { parseIntent } from '../intent'

const mockConfig = { provider: 'anthropic' as const, apiKey: 'test', model: 'claude-sonnet-4-6' }
const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('parseIntent', () => {
  it('classifies new component request as component-builder', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skill: 'component-builder',
        targetComponentId: undefined,
        summary: 'stock ticker showing AAPL price',
        isMultiTurn: false,
      }
    } as any)

    const result = await parseIntent('Add a live stock ticker for AAPL', mockConfig, mockRegistry as any)
    expect(result.skill).toBe('component-builder')
    expect(result.summary).toBe('stock ticker showing AAPL price')
  })

  it('classifies modification request as component-modifier', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skill: 'component-modifier',
        targetComponentId: 'todo-list',
        summary: 'make todo items draggable',
        isMultiTurn: false,
      }
    } as any)

    const result = await parseIntent('Make the todo list items draggable', mockConfig, mockRegistry as any)
    expect(result.skill).toBe('component-modifier')
    expect(result.targetComponentId).toBe('todo-list')
  })

  it('classifies style request as style-applier', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        skill: 'style-applier',
        targetComponentId: 'header',
        summary: 'apply dark theme colors',
        isMultiTurn: false,
      }
    } as any)

    const result = await parseIntent('Make the header darker', mockConfig, mockRegistry as any)
    expect(result.skill).toBe('style-applier')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- intent
```

Expected: FAIL — `Cannot find module '../intent'`

- [ ] **Step 3: Create src/main/agent/intent.ts**

```typescript
import { generateObject } from 'ai'
import { z } from 'zod'
import type { LLMConfig } from './providers'
import { fastModelId } from './providers'

export const SkillNameSchema = z.enum([
  'component-builder',
  'component-modifier',
  'manifest-generator',
  'component-search',
  'state-wirer',
  'feedback-iterator',
  'style-applier',
])

export type SkillName = z.infer<typeof SkillNameSchema>

export const IntentSchema = z.object({
  skill: SkillNameSchema,
  targetComponentId: z.string().optional(),
  summary: z.string(),
  isMultiTurn: z.boolean(),
})

export type Intent = z.infer<typeof IntentSchema>

const INTENT_SYSTEM = `You are the CSlate intent classifier. Given a user message, classify it into the most appropriate skill and extract key information.

Skills:
- component-builder: User wants to create a brand new component ("add", "create", "build", "make a new")
- component-modifier: User wants to change an existing component ("update", "modify", "change", "add X to the Y component")
- manifest-generator: User wants to fix or create a component manifest ("manifest", "inputs", "outputs", "contract")
- component-search: User wants to find or browse existing components ("find", "search", "show me components", "do you have")
- state-wirer: User wants to connect components together ("connect", "wire", "link", "when X updates Y", "share data between")
- feedback-iterator: User is giving feedback on the current result ("I don't like", "make it", "change the", "too big", "wrong color", "looks bad")
- style-applier: User wants visual/style changes ("restyle", "dark mode", "colors", "font", "theme", "make it prettier")

targetComponentId: the componentId of an existing component being referenced (snake_case). Omit if creating new.
summary: one sentence describing what to do.
isMultiTurn: true if this will need back-and-forth conversation.`

export async function parseIntent(
  message: string,
  config: LLMConfig,
  registry: ReturnType<typeof import('./providers').buildRegistry>
): Promise<Intent> {
  const { object } = await generateObject({
    model: registry.languageModel(fastModelId(config)),
    system: INTENT_SYSTEM,
    prompt: message,
    schema: IntentSchema,
  })
  return object
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- intent
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/intent.ts src/main/agent/__tests__/intent.test.ts
git commit -m "feat: add intent parser for skill routing"
```

---

## Task 4: Memory System

**Files:**
- Create: `src/main/agent/memory/index.ts`
- Create: `src/main/agent/memory/context-builder.ts`
- Create: `src/main/agent/memory/__tests__/memory.test.ts`

Memory reads/writes markdown files under `<projectDir>/agent/memory/`. The context builder assembles them into a compact string injected into skill system prompts.

- [ ] **Step 1: Write the failing tests**

`src/main/agent/memory/__tests__/memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { readMemory, writeMemoryEntry, initMemory } from '../index'
import { buildContextString } from '../context-builder'

const TEST_DIR = join(__dirname, '__test_project__')

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'agent', 'memory'), { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('initMemory', () => {
  it('creates memory directory and MEMORY.md index if missing', async () => {
    const freshDir = join(__dirname, '__fresh_project__')
    try {
      await initMemory(freshDir)
      expect(existsSync(join(freshDir, 'agent', 'memory', 'MEMORY.md'))).toBe(true)
    } finally {
      rmSync(freshDir, { recursive: true, force: true })
    }
  })
})

describe('readMemory', () => {
  it('returns empty object when memory dir does not exist', async () => {
    const emptyDir = join(__dirname, '__empty__')
    const result = await readMemory(emptyDir)
    expect(result.userPreferences).toBe('')
    expect(result.projectContext).toBe('')
    expect(result.componentHistory).toBe('')
    expect(result.feedbackPatterns).toBe('')
  })

  it('reads existing memory files', async () => {
    writeFileSync(
      join(TEST_DIR, 'agent', 'memory', 'user_preferences.md'),
      '# User Preferences\nPrefers minimal styling.'
    )
    const result = await readMemory(TEST_DIR)
    expect(result.userPreferences).toContain('Prefers minimal styling.')
  })
})

describe('writeMemoryEntry', () => {
  it('appends to component_history.md', async () => {
    await writeMemoryEntry(TEST_DIR, 'componentHistory', 'Built todo-list in 2 iterations.')
    const content = readFileSync(join(TEST_DIR, 'agent', 'memory', 'component_history.md'), 'utf-8')
    expect(content).toContain('Built todo-list in 2 iterations.')
  })

  it('overwrites user_preferences.md', async () => {
    await writeMemoryEntry(TEST_DIR, 'userPreferences', 'Prefers dark themes.', 'overwrite')
    const content = readFileSync(join(TEST_DIR, 'agent', 'memory', 'user_preferences.md'), 'utf-8')
    expect(content).toBe('Prefers dark themes.')
  })
})

describe('buildContextString', () => {
  it('returns empty context string for empty memory', () => {
    const ctx = buildContextString({ userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' })
    expect(ctx).toBe('')
  })

  it('includes non-empty memory sections', () => {
    const ctx = buildContextString({
      userPreferences: 'Prefers dark themes.',
      projectContext: 'A productivity app.',
      componentHistory: '',
      feedbackPatterns: '',
    })
    expect(ctx).toContain('Prefers dark themes.')
    expect(ctx).toContain('A productivity app.')
    expect(ctx).not.toContain('Component History')
  })

  it('keeps context string under 800 tokens (approx 3200 chars)', () => {
    const longText = 'x'.repeat(1000)
    const ctx = buildContextString({
      userPreferences: longText,
      projectContext: longText,
      componentHistory: longText,
      feedbackPatterns: longText,
    })
    expect(ctx.length).toBeLessThan(3200)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- memory
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Create src/main/agent/memory/index.ts**

```typescript
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface MemoryFiles {
  userPreferences: string
  projectContext: string
  componentHistory: string
  feedbackPatterns: string
}

const FILE_MAP: Record<keyof MemoryFiles, string> = {
  userPreferences: 'user_preferences.md',
  projectContext: 'project_context.md',
  componentHistory: 'component_history.md',
  feedbackPatterns: 'feedback_patterns.md',
}

function memoryDir(projectDir: string): string {
  return join(projectDir, 'agent', 'memory')
}

export async function initMemory(projectDir: string): Promise<void> {
  const dir = memoryDir(projectDir)
  await mkdir(dir, { recursive: true })
  const indexPath = join(dir, 'MEMORY.md')
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '# Agent Memory\n\n- [User Preferences](user_preferences.md)\n- [Project Context](project_context.md)\n- [Component History](component_history.md)\n- [Feedback Patterns](feedback_patterns.md)\n')
  }
}

export async function readMemory(projectDir: string): Promise<MemoryFiles> {
  const dir = memoryDir(projectDir)
  const result: MemoryFiles = { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' }
  if (!existsSync(dir)) return result

  for (const [key, filename] of Object.entries(FILE_MAP) as [keyof MemoryFiles, string][]) {
    const filePath = join(dir, filename)
    if (existsSync(filePath)) {
      result[key] = await readFile(filePath, 'utf-8')
    }
  }
  return result
}

export async function writeMemoryEntry(
  projectDir: string,
  key: keyof MemoryFiles,
  content: string,
  mode: 'append' | 'overwrite' = 'append'
): Promise<void> {
  await initMemory(projectDir)
  const filePath = join(memoryDir(projectDir), FILE_MAP[key])
  if (mode === 'overwrite') {
    await writeFile(filePath, content, 'utf-8')
  } else {
    const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
    await writeFile(filePath, existing ? `${existing}\n${content}` : content, 'utf-8')
  }
}
```

- [ ] **Step 4: Create src/main/agent/memory/context-builder.ts**

```typescript
import type { MemoryFiles } from './index'

const MAX_CHARS = 3000

interface Section {
  heading: string
  content: string
}

export function buildContextString(memory: MemoryFiles): string {
  const sections: Section[] = [
    { heading: 'User Preferences', content: memory.userPreferences.trim() },
    { heading: 'Project Context', content: memory.projectContext.trim() },
    { heading: 'Component History', content: memory.componentHistory.trim() },
    { heading: 'Feedback Patterns', content: memory.feedbackPatterns.trim() },
  ].filter(s => s.content.length > 0)

  if (sections.length === 0) return ''

  let result = '## Project Memory\n'
  for (const section of sections) {
    const block = `\n### ${section.heading}\n${section.content}\n`
    if (result.length + block.length > MAX_CHARS) {
      // Truncate content to fit
      const remaining = MAX_CHARS - result.length - `\n### ${section.heading}\n`.length - 20
      if (remaining > 50) {
        result += `\n### ${section.heading}\n${section.content.slice(0, remaining)}…\n`
      }
      break
    }
    result += block
  }
  return result
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- memory
```

Expected: PASS (all 8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/memory/
git commit -m "feat: add agent memory system (read/write/context-builder)"
```

---

## Task 5: Tool Layer

**Files:**
- Create: `src/main/agent/tools/renderComponent.ts`
- Create: `src/main/agent/tools/writeComponent.ts`
- Create: `src/main/agent/tools/readManifest.ts`
- Create: `src/main/agent/tools/searchBlueprints.ts`
- Create: `src/main/agent/tools/readProjectContext.ts`
- Create: `src/main/agent/tools/validateManifest.ts`
- Create: `src/main/agent/tools/reviewCode.ts`
- Create: `src/main/agent/tools/index.ts`
- Create: `src/main/agent/tools/__tests__/validateManifest.test.ts`
- Create: `src/main/agent/tools/__tests__/reviewCode.test.ts`

Tools are Vercel AI SDK `tool()` instances. Most talk to existing IPC handlers or the server API. `reviewCode` spawns a sub-agent via a nested `generateText` call.

- [ ] **Step 1: Write failing tests for validateManifest and reviewCode**

`src/main/agent/tools/__tests__/validateManifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validateManifest'

describe('validateManifest tool execute', () => {
  it('returns valid=true for a minimal valid manifest', async () => {
    const manifest = {
      name: 'Test Component',
      description: 'A test component',
      tags: ['test'],
      inputs: {},
      outputs: {},
      events: {},
      actions: {},
      files: [{ path: 'ui.tsx', type: 'ui', role: 'main render' }],
      defaultSize: { width: 20, height: 15 },
    }
    const result = await validateManifest.execute!({ manifest }, {} as any)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid=false and lists errors for missing required fields', async () => {
    const manifest = { name: 'Bad' }
    const result = await validateManifest.execute!({ manifest }, {} as any)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
```

`src/main/agent/tools/__tests__/reviewCode.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn()
}))

import { generateText } from 'ai'
import { createReviewCodeTool } from '../reviewCode'

describe('reviewCode sub-agent tool', () => {
  it('returns passed=true when reviewer finds no issues', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ passed: true, issues: [], suggestions: ['Consider adding aria-labels'] })
    } as any)

    const tool = createReviewCodeTool({ languageModel: vi.fn().mockReturnValue({}) } as any, 'local:test')
    const result = await tool.execute!({
      files: { 'ui.tsx': 'export default function Foo() { return <div>hi</div> }' },
      manifest: {
        name: 'Foo', description: 'test', tags: [], inputs: {}, outputs: {},
        events: {}, actions: {}, files: [], defaultSize: { width: 10, height: 10 }
      }
    }, {} as any)

    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns passed=false when reviewer finds issues', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ passed: false, issues: ['Uses eval()'], suggestions: [] })
    } as any)

    const tool = createReviewCodeTool({ languageModel: vi.fn().mockReturnValue({}) } as any, 'local:test')
    const result = await tool.execute!({
      files: { 'ui.tsx': 'eval("bad")' },
      manifest: { name: 'Bad', description: '', tags: [], inputs: {}, outputs: {},
        events: {}, actions: {}, files: [], defaultSize: { width: 10, height: 10 } }
    }, {} as any)

    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Uses eval()')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- "tools/__tests__"
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create src/main/agent/tools/validateManifest.ts**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { ComponentManifestSchema } from '@cslate/shared'

export const validateManifest = tool({
  description: 'Validate a component manifest against the CSlate schema. Always call this before writeComponent.',
  parameters: z.object({
    manifest: z.unknown().describe('The manifest object to validate'),
  }),
  execute: async ({ manifest }) => {
    const result = ComponentManifestSchema.safeParse(manifest)
    if (result.success) {
      return { valid: true, errors: [] as string[] }
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return { valid: false, errors }
  },
})
```

- [ ] **Step 4: Create src/main/agent/tools/reviewCode.ts**

```typescript
import { tool, generateText } from 'ai'
import { z } from 'zod'
import type { ComponentManifest } from '@cslate/shared'

const REVIEWER_SYSTEM = `You are a CSlate code reviewer. Review the provided React component code and manifest for:
1. Sandbox compliance: no fetch(), no localStorage, no window.location, no eval(), no dangerouslySetInnerHTML with user input
2. Bridge compliance: external data must use bridge.fetch() or bridge.subscribe() only
3. Zustand patterns: instance-prefixed state keys (componentId.keyName), use stateKey in manifest
4. Tailwind tokens: must use semantic tokens (bg-primary, text-text) not hardcoded colors (bg-blue-500)
5. TypeScript: no 'any' casts, no missing types
6. Manifest accuracy: inputs/outputs in manifest must match props used in ui.tsx

Respond with ONLY valid JSON: { "passed": boolean, "issues": string[], "suggestions": string[] }
No explanation outside the JSON.`

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

type ReviewResult = { passed: boolean; issues: string[]; suggestions: string[] }

export function createReviewCodeTool(
  registry: { languageModel: (id: string) => any },
  fastModelId: string
) {
  return tool({
    description: 'Spawn an isolated code review sub-agent to check the generated component. Run in parallel with renderComponent. If issues are found, fix them before calling writeComponent.',
    parameters: z.object({
      files: FilesSchema,
      manifest: z.unknown().describe('The ComponentManifest object'),
    }),
    execute: async ({ files, manifest }) => {
      const filesText = Object.entries(files)
        .map(([name, content]) => `### ${name}\n\`\`\`tsx\n${content}\n\`\`\``)
        .join('\n\n')

      const { text } = await generateText({
        model: registry.languageModel(fastModelId),
        system: REVIEWER_SYSTEM,
        prompt: `Review this component:\n\n${filesText}\n\n### manifest.json\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``,
        maxTokens: 1000,
      })

      try {
        return JSON.parse(text) as ReviewResult
      } catch {
        return { passed: false, issues: ['Reviewer returned invalid JSON'], suggestions: [] }
      }
    },
  })
}
```

- [ ] **Step 5: Create src/main/agent/tools/renderComponent.ts**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import type { WebContents } from 'electron'

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

// sender is the renderer WebContents — injected by the IPC handler
export function createRenderComponentTool(sender: WebContents, tabId: string) {
  return tool({
    description: 'Render a generated component in the sandbox iframe on the Slate canvas. Call this to show the component to the user. The component will appear immediately.',
    parameters: z.object({
      files: FilesSchema,
      manifest: z.unknown().describe('The ComponentManifest object'),
      placement: z.object({
        x: z.number().describe('Grid units from left'),
        y: z.number().describe('Grid units from top'),
        width: z.number().describe('Width in grid units (1 unit = 8px)'),
        height: z.number().describe('Height in grid units'),
      }).optional().describe('Where to place the component on the canvas. Omit to auto-place.'),
    }),
    execute: async ({ files, manifest, placement }) => {
      const componentId = `comp_${Date.now()}`
      sender.send('sandbox:load', { tabId, componentId, files, manifest, placement })
      return { success: true, componentId }
    },
  })
}
```

- [ ] **Step 6: Create src/main/agent/tools/writeComponent.ts**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

export function createWriteComponentTool(projectDir: string) {
  return tool({
    description: 'Save a component package to the project directory. Only call this after validateManifest returns valid=true and reviewCode returns passed=true.',
    parameters: z.object({
      componentId: z.string().describe('snake_case identifier, e.g. "stock_ticker"'),
      files: FilesSchema,
      manifest: z.unknown().describe('The validated ComponentManifest object'),
      contextMd: z.string().describe('AI-generated summary of what was built and why. 2-4 sentences.'),
    }),
    execute: async ({ componentId, files, manifest, contextMd }) => {
      const dir = join(projectDir, 'components', componentId)
      await mkdir(dir, { recursive: true })

      const writes: Promise<void>[] = [
        writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8'),
        writeFile(join(dir, 'context.md'), contextMd, 'utf-8'),
        writeFile(join(dir, 'ui.tsx'), files['ui.tsx'], 'utf-8'),
      ]
      if (files['logic.ts']) writes.push(writeFile(join(dir, 'logic.ts'), files['logic.ts'], 'utf-8'))
      if (files['types.ts']) writes.push(writeFile(join(dir, 'types.ts'), files['types.ts'], 'utf-8'))

      await Promise.all(writes)
      return { success: true, path: dir }
    },
  })
}
```

- [ ] **Step 7: Create src/main/agent/tools/readManifest.ts**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export function createReadManifestTool(projectDir: string) {
  return tool({
    description: 'Read the manifest.json for a component that already exists in the project.',
    parameters: z.object({
      componentId: z.string().describe('The component directory name, e.g. "stock_ticker"'),
    }),
    execute: async ({ componentId }) => {
      const manifestPath = join(projectDir, 'components', componentId, 'manifest.json')
      if (!existsSync(manifestPath)) {
        return { error: `Component "${componentId}" not found` }
      }
      const raw = await readFile(manifestPath, 'utf-8')
      return { manifest: JSON.parse(raw) }
    },
  })
}
```

- [ ] **Step 8: Create src/main/agent/tools/readProjectContext.ts**

```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { readdirSync } from 'fs'

export function createReadProjectContextTool(projectDir: string) {
  return tool({
    description: 'Read the current project context: the app name/description and all component manifests currently on the canvas.',
    parameters: z.object({
      includeSourceSummaries: z.boolean().default(false).describe('Whether to include context.md summaries for each component'),
    }),
    execute: async ({ includeSourceSummaries }) => {
      const appManifestPath = join(projectDir, 'cslate.json')
      let appManifest: Record<string, unknown> = {}
      if (existsSync(appManifestPath)) {
        appManifest = JSON.parse(await readFile(appManifestPath, 'utf-8'))
      }

      const componentsDir = join(projectDir, 'components')
      const components: Record<string, unknown>[] = []
      if (existsSync(componentsDir)) {
        const dirs = readdirSync(componentsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)

        for (const name of dirs) {
          const manifestPath = join(componentsDir, name, 'manifest.json')
          if (!existsSync(manifestPath)) continue
          const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
          const entry: Record<string, unknown> = { componentId: name, manifest }
          if (includeSourceSummaries) {
            const contextPath = join(componentsDir, name, 'context.md')
            if (existsSync(contextPath)) {
              entry.context = await readFile(contextPath, 'utf-8')
            }
          }
          components.push(entry)
        }
      }

      return { app: appManifest, components }
    },
  })
}
```

- [ ] **Step 9: Create src/main/agent/tools/searchBlueprints.ts**

```typescript
import { tool } from 'ai'
import { z } from 'zod'

export function createSearchBlueprintsTool(serverUrl: string, serverApiKey: string) {
  return tool({
    description: 'Search the CSlate community database for existing component blueprints matching a description. Always search before building from scratch — a good blueprint saves iterations.',
    parameters: z.object({
      query: z.string().describe('Natural language description of the component you want to find'),
      limit: z.number().min(1).max(10).default(5),
    }),
    execute: async ({ query, limit }) => {
      try {
        const url = new URL('/api/components/search', serverUrl)
        url.searchParams.set('q', query)
        url.searchParams.set('limit', String(limit))
        const res = await fetch(url.toString(), {
          headers: { Authorization: `ApiKey ${serverApiKey}` },
        })
        if (!res.ok) return { results: [], error: `Server returned ${res.status}` }
        return await res.json()
      } catch (err) {
        return { results: [], error: 'Could not reach CSlate server' }
      }
    },
  })
}
```

- [ ] **Step 10: Create src/main/agent/tools/index.ts**

```typescript
export { validateManifest } from './validateManifest'
export { createReviewCodeTool } from './reviewCode'
export { createRenderComponentTool } from './renderComponent'
export { createWriteComponentTool } from './writeComponent'
export { createReadManifestTool } from './readManifest'
export { createReadProjectContextTool } from './readProjectContext'
export { createSearchBlueprintsTool } from './searchBlueprints'
```

- [ ] **Step 11: Run tests to confirm they pass**

```bash
npm test -- "tools/__tests__"
```

Expected: PASS (4 tests: 2 validateManifest + 2 reviewCode)

- [ ] **Step 12: Commit**

```bash
git add src/main/agent/tools/
git commit -m "feat: add agent tool layer (render, write, read, search, validate, review)"
```

---

## Task 6: Skill System

**Files:**
- Create: `src/main/agent/skills/types.ts`
- Create: `src/main/agent/skills/component-builder.ts`
- Create: `src/main/agent/skills/component-modifier.ts`
- Create: `src/main/agent/skills/manifest-generator.ts`
- Create: `src/main/agent/skills/component-search.ts`
- Create: `src/main/agent/skills/state-wirer.ts`
- Create: `src/main/agent/skills/feedback-iterator.ts`
- Create: `src/main/agent/skills/style-applier.ts`
- Create: `src/main/agent/skills/index.ts`
- Create: `src/main/agent/skills/__tests__/skills.test.ts`

Skills are config objects. The critical one is `component-builder` — its system prompt embeds the full platform knowledge needed to generate correct components in one pass.

- [ ] **Step 1: Create src/main/agent/skills/types.ts**

```typescript
import type { Tool } from 'ai'
import type { MemoryFiles } from '../memory/index'

export interface AgentContext {
  projectDir: string
  tabId: string
  memory: MemoryFiles
  activeComponents: Array<{ componentId: string; manifest: unknown }>
  targetComponentId?: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface SkillConfig {
  name: string
  description: string
  systemPrompt: (ctx: AgentContext) => string
  tools: Record<string, Tool>
  maxSteps?: number
  maxTokens?: number
  temperature?: number
}
```

- [ ] **Step 2: Create src/main/agent/skills/component-builder.ts**

This is the most important skill. Its system prompt is the "brain" that makes components accurate.

```typescript
import { stepCountIs } from 'ai'
import type { SkillConfig, AgentContext } from './types'
import { buildContextString } from '../memory/context-builder'

const PLATFORM_KNOWLEDGE = `
## CSlate Platform Rules

### Component Package Structure
Every component is a multi-file package:
- ui.tsx       REQUIRED — the React component (default export). Renders the UI.
- logic.ts     OPTIONAL — custom hooks, data transforms, business logic (no JSX)
- types.ts     OPTIONAL — shared TypeScript interfaces for data shapes
- context.md   REQUIRED — 2-4 sentence summary of what was built and why
- manifest.json REQUIRED — the contract (inputs/outputs/events/actions/dataSources)

### Sandbox Constraints (CRITICAL — violating these breaks the component)
- NO fetch() — use bridge.fetch() for external data
- NO localStorage / sessionStorage
- NO window.location or window.history
- NO eval() or new Function()
- NO dangerouslySetInnerHTML with user-supplied strings
- NO direct DOM access outside the component's own container
- YES: React state, hooks, props, Tailwind classes, bridge.*, Zustand store

### Bridge API (for external data)
\`\`\`typescript
// Declared in manifest.json > dataSources
// Used in ui.tsx or logic.ts:
const data = await bridge.fetch('sourceId', 'endpointId', { param: value })
const unsub = bridge.subscribe('sourceId', 'endpointId', params, (data) => setState(data))
const apiKey = bridge.getConfig('apiKeyName')  // for userConfig fields
\`\`\`

### Zustand State Store
- One flat key-value store per Slate tab
- Instance-prefixed keys: \`{componentId}.{keyName}\` e.g. \`stock_ticker.price\`
- Declare in manifest: inputs with stateKey (reads), outputs with stateKey (writes)
- Never import zustand directly — the store is injected as a prop

### Design Tokens (ALWAYS use these, NEVER hardcode colors)
| Token class          | CSS Variable          | Meaning              |
|----------------------|-----------------------|----------------------|
| bg-primary           | --slate-primary       | Brand color          |
| bg-secondary         | --slate-secondary     | Secondary action     |
| bg-accent            | --slate-accent        | Highlight            |
| bg-background        | --slate-bg            | App background       |
| bg-surface           | --slate-surface       | Card/panel bg        |
| text-text            | --slate-text          | Primary text         |
| text-muted           | --slate-text-muted    | Secondary text       |
| border-border        | --slate-border        | Borders/dividers     |
| text-error           | --slate-error         | Error state          |
| text-success         | --slate-success       | Success state        |
| text-warning         | --slate-warning       | Warning state        |

### Grid System
- Base unit: 8px
- defaultSize in manifest is in grid units (multiply by 8 for pixels)
- Typical sizes: small widget = 20×15, medium card = 30×25, large panel = 50×40

### Manifest Format (required fields)
\`\`\`json
{
  "name": "Human Readable Name",
  "description": "What this component does in 1-2 sentences",
  "tags": ["category", "keywords"],
  "inputs": {
    "propName": { "type": "string", "description": "...", "required": true, "stateKey": "comp.key" }
  },
  "outputs": {
    "valueName": { "type": "number", "description": "...", "stateKey": "comp.outputKey" }
  },
  "events": {
    "onItemSelected": { "description": "...", "payload": { "id": { "type": "string", "description": "..." } } }
  },
  "actions": {
    "refresh": { "description": "...", "params": {} }
  },
  "files": [
    { "path": "ui.tsx", "type": "ui", "role": "main render" },
    { "path": "logic.ts", "type": "logic", "role": "data hooks" }
  ],
  "defaultSize": { "width": 30, "height": 25 }
}
\`\`\`
`

export function componentBuilderSkill(
  tools: Record<string, import('ai').Tool>
): SkillConfig {
  return {
    name: 'component-builder',
    description: 'Build a new React component package from natural language',
    maxSteps: 8,
    temperature: 0.2,
    tools,
    systemPrompt: (ctx: AgentContext) => {
      const memoryContext = buildContextString(ctx.memory)
      const canvasContext = ctx.activeComponents.length > 0
        ? `\n## Components on Canvas\n${ctx.activeComponents.map(c => `- ${c.componentId}: ${JSON.stringify((c.manifest as any).name)}`).join('\n')}`
        : ''

      return `You are the CSlate Agent — an expert at building React component packages for the CSlate platform.
${PLATFORM_KNOWLEDGE}
${memoryContext}${canvasContext}

## Your Task
Build a complete, working component package. Follow this workflow:
1. Call searchBlueprints to find similar community components. If a good match exists, use it as a base.
2. Generate ui.tsx (and logic.ts, types.ts if the logic is complex enough to separate).
3. Generate a complete manifest.json following the format above.
4. Generate a 2-4 sentence context.md summarizing what was built.
5. Call renderComponent AND reviewCode in the SAME step (they run in parallel).
6. If reviewCode returns issues, fix them in the code and re-render.
7. Call validateManifest. Fix any errors.
8. Call writeComponent to save the package.

Be specific and complete. Non-technical users are watching the result live — it must look great and work correctly on the first render.`
    },
  }
}
```

- [ ] **Step 3: Create src/main/agent/skills/component-modifier.ts**

```typescript
import type { SkillConfig, AgentContext } from './types'
import { buildContextString } from '../memory/context-builder'

export function componentModifierSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'component-modifier',
    description: 'Modify an existing component while preserving its manifest contract',
    maxSteps: 6,
    temperature: 0.2,
    tools,
    systemPrompt: (ctx: AgentContext) => {
      const memoryContext = buildContextString(ctx.memory)
      return `You are the CSlate Agent modifying an existing component.
${memoryContext}

## Your Task
Modify the component "${ctx.targetComponentId ?? 'the target component'}" based on the user's request.

Workflow:
1. Call readManifest to load the current manifest. Understand the existing inputs/outputs/events.
2. Make the requested changes to ui.tsx (and logic.ts/types.ts if needed).
3. Preserve all existing manifest contracts unless the user explicitly asked to change them.
4. Call renderComponent AND reviewCode in the same step.
5. Fix any issues found by reviewCode.
6. Call validateManifest on the updated manifest.
7. Call writeComponent to save.

CRITICAL: Do not break existing state key bindings or event names — other components may depend on them.`
    },
  }
}
```

- [ ] **Step 4: Create src/main/agent/skills/manifest-generator.ts**

```typescript
import type { SkillConfig, AgentContext } from './types'

export function manifestGeneratorSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'manifest-generator',
    description: 'Create or repair a component manifest',
    maxSteps: 4,
    temperature: 0.1,
    tools,
    systemPrompt: (_ctx: AgentContext) => `You are the CSlate Agent fixing or generating a component manifest.

A manifest must accurately describe all props the component uses, all state keys it reads/writes, all events it emits, and all actions it responds to.

Workflow:
1. Call readManifest if the component exists, to see the current manifest.
2. Generate a corrected manifest matching the component's actual behavior.
3. Call validateManifest to check it.
4. Call writeComponent with the corrected manifest (you may omit files if only the manifest changed — pass the existing file content unchanged).`,
  }
}
```

- [ ] **Step 5: Create src/main/agent/skills/component-search.ts**

```typescript
import type { SkillConfig, AgentContext } from './types'

export function componentSearchSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'component-search',
    description: 'Search the community blueprint database for matching components',
    maxSteps: 3,
    temperature: 0.3,
    tools,
    systemPrompt: (_ctx: AgentContext) => `You are the CSlate Agent helping the user find community components.

Call searchBlueprints with a clear, specific query. Show the user what you found — name, description, and what it does. If multiple results look relevant, list them all. Tell the user they can ask you to "use the X one" to build from that blueprint.`,
  }
}
```

- [ ] **Step 6: Create src/main/agent/skills/state-wirer.ts**

```typescript
import type { SkillConfig, AgentContext } from './types'

export function stateWirerSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'state-wirer',
    description: 'Connect two or more components via Zustand state keys or event bus',
    maxSteps: 6,
    temperature: 0.1,
    tools,
    systemPrompt: (ctx: AgentContext) => `You are the CSlate Agent wiring components together.

Current canvas components:
${ctx.activeComponents.map(c => `- ${c.componentId}`).join('\n') || 'None'}

Workflow:
1. Call readManifest for each component involved.
2. Find matching output stateKeys → input stateKeys across their manifests.
3. If already wired (same stateKey value), tell the user — no changes needed.
4. If not wired, update both manifests so the output's stateKey matches the input's stateKey.
5. Call writeComponent for each modified manifest.
6. Explain to the user what is now connected and how it works.`,
  }
}
```

- [ ] **Step 7: Create src/main/agent/skills/feedback-iterator.ts**

```typescript
import type { SkillConfig, AgentContext } from './types'
import { buildContextString } from '../memory/context-builder'

export function feedbackIteratorSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'feedback-iterator',
    description: 'Iterate on a component based on user feedback',
    maxSteps: 5,
    temperature: 0.3,
    tools,
    systemPrompt: (ctx: AgentContext) => {
      const memoryContext = buildContextString(ctx.memory)
      return `You are the CSlate Agent iterating on a component based on feedback.
${memoryContext}

Workflow:
1. Call readManifest for the component being refined.
2. Apply the user's requested changes to ui.tsx and/or logic.ts.
3. Keep all changes minimal — only what the user asked for.
4. Call renderComponent AND reviewCode in the same step.
5. Fix any review issues.
6. Call writeComponent.`
    },
  }
}
```

- [ ] **Step 8: Create src/main/agent/skills/style-applier.ts**

```typescript
import type { SkillConfig, AgentContext } from './types'

export function styleApplierSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'style-applier',
    description: 'Apply visual/style changes using Tailwind design tokens',
    maxSteps: 4,
    temperature: 0.3,
    tools,
    systemPrompt: (_ctx: AgentContext) => `You are the CSlate Agent applying styling changes.

ALWAYS use design token classes, NEVER hardcode colors:
- bg-primary, bg-secondary, bg-accent, bg-background, bg-surface
- text-text, text-muted, text-error, text-success, text-warning
- border-border, shadow-sm, shadow-md, shadow-lg
- rounded-sm, rounded-md, rounded-lg, rounded-full

Workflow:
1. Call readManifest to load the current component.
2. Apply ONLY the requested style changes. Do not restructure the component.
3. Call renderComponent AND reviewCode.
4. Call writeComponent.`,
  }
}
```

- [ ] **Step 9: Create src/main/agent/skills/index.ts**

```typescript
import type { Tool } from 'ai'
import type { SkillConfig } from './types'
import { componentBuilderSkill } from './component-builder'
import { componentModifierSkill } from './component-modifier'
import { manifestGeneratorSkill } from './manifest-generator'
import { componentSearchSkill } from './component-search'
import { stateWirerSkill } from './state-wirer'
import { feedbackIteratorSkill } from './feedback-iterator'
import { styleApplierSkill } from './style-applier'
import type { SkillName } from '../intent'

export type { SkillConfig, AgentContext } from './types'

export function buildSkillRegistry(tools: Record<string, Tool>): Record<SkillName, SkillConfig> {
  return {
    'component-builder': componentBuilderSkill(tools),
    'component-modifier': componentModifierSkill(tools),
    'manifest-generator': manifestGeneratorSkill(tools),
    'component-search': componentSearchSkill(tools),
    'state-wirer': stateWirerSkill(tools),
    'feedback-iterator': feedbackIteratorSkill(tools),
    'style-applier': styleApplierSkill(tools),
  }
}
```

- [ ] **Step 10: Write and run skill tests**

`src/main/agent/skills/__tests__/skills.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSkillRegistry } from '../index'

const mockTools = {}

describe('buildSkillRegistry', () => {
  it('returns all 7 skills', () => {
    const registry = buildSkillRegistry(mockTools)
    expect(Object.keys(registry)).toHaveLength(7)
    expect(registry['component-builder']).toBeDefined()
    expect(registry['component-modifier']).toBeDefined()
    expect(registry['state-wirer']).toBeDefined()
  })

  it('component-builder systemPrompt includes platform knowledge', () => {
    const registry = buildSkillRegistry(mockTools)
    const skill = registry['component-builder']
    const prompt = skill.systemPrompt({
      projectDir: '/tmp/test',
      tabId: 'tab1',
      memory: { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' },
      activeComponents: [],
      conversationHistory: [],
    })
    expect(prompt).toContain('bridge.fetch')
    expect(prompt).toContain('bg-primary')
    expect(prompt).toContain('manifest.json')
    expect(prompt).toContain('sandbox')
  })

  it('component-builder systemPrompt includes memory context when present', () => {
    const registry = buildSkillRegistry(mockTools)
    const skill = registry['component-builder']
    const prompt = skill.systemPrompt({
      projectDir: '/tmp/test',
      tabId: 'tab1',
      memory: { userPreferences: 'Prefers dark themes.', projectContext: '', componentHistory: '', feedbackPatterns: '' },
      activeComponents: [],
      conversationHistory: [],
    })
    expect(prompt).toContain('Prefers dark themes.')
  })

  it('state-wirer systemPrompt lists active components', () => {
    const registry = buildSkillRegistry(mockTools)
    const skill = registry['state-wirer']
    const prompt = skill.systemPrompt({
      projectDir: '/tmp/test',
      tabId: 'tab1',
      memory: { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' },
      activeComponents: [{ componentId: 'stock_ticker', manifest: {} }],
      conversationHistory: [],
    })
    expect(prompt).toContain('stock_ticker')
  })
})
```

```bash
npm test -- "skills/__tests__"
```

Expected: PASS (4 tests)

- [ ] **Step 11: Commit**

```bash
git add src/main/agent/skills/
git commit -m "feat: add agent skill system (7 skills with system prompts)"
```

---

## Task 7: AgentEngine

**Files:**
- Create: `src/main/agent/engine.ts`
- Create: `src/main/agent/__tests__/engine.test.ts`

The `AgentEngine` class orchestrates the full flow: intent → skill → context → `streamText` → stream parts.

- [ ] **Step 1: Write the failing test**

`src/main/agent/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
}))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn(() => ({})) }))
vi.mock('@ai-sdk/openai', () => ({ openai: vi.fn(() => ({})) }))
vi.mock('@ai-sdk/google', () => ({ google: vi.fn(() => ({})) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => ({})) }))
vi.mock('../tools/searchBlueprints', () => ({
  createSearchBlueprintsTool: vi.fn(() => ({ description: 'search', parameters: {}, execute: vi.fn() }))
}))

import { generateObject, streamText } from 'ai'
import { AgentEngine } from '../engine'

const TEST_PROJECT = join(__dirname, '__engine_test_project__')

beforeEach(() => {
  mkdirSync(join(TEST_PROJECT, 'agent', 'memory'), { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(TEST_PROJECT, { recursive: true, force: true })
})

const mockConfig = { provider: 'anthropic' as const, apiKey: 'test', model: 'claude-sonnet-4-6' }

describe('AgentEngine.stream', () => {
  it('calls parseIntent then streams with selected skill', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { skill: 'component-builder', summary: 'a button', isMultiTurn: false }
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Hello' }
      yield { type: 'finish', usage: { totalTokens: 100 } }
    })()

    vi.mocked(streamText).mockReturnValue({ fullStream: mockFullStream } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    const parts: unknown[] = []
    for await (const part of engine.stream({ message: 'add a button', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(generateObject).toHaveBeenCalledOnce()
    expect(streamText).toHaveBeenCalledOnce()
    expect(parts.some((p: any) => p.type === 'text-delta')).toBe(true)
  })

  it('passes memory context into skill system prompt', async () => {
    // Write some memory
    const { writeMemoryEntry } = await import('../memory/index')
    await writeMemoryEntry(TEST_PROJECT, 'userPreferences', 'Prefers minimal design.')

    vi.mocked(generateObject).mockResolvedValue({
      object: { skill: 'component-builder', summary: 'a card', isMultiTurn: false }
    } as any)
    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () { yield { type: 'finish', usage: {} } })()
    } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    for await (const _ of engine.stream({ message: 'add a card', conversationHistory: [] })) { /* drain */ }

    const callArgs = vi.mocked(streamText).mock.calls[0][0]
    expect(callArgs.system).toContain('Prefers minimal design.')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- "engine.test"
```

Expected: FAIL — `Cannot find module '../engine'`

- [ ] **Step 3: Create src/main/agent/engine.ts**

```typescript
import { streamText, stepCountIs } from 'ai'
import type { WebContents } from 'electron'
import { buildRegistry, mainModelId, fastModelId, type LLMConfig } from './providers'
import { parseIntent } from './intent'
import { readMemory, writeMemoryEntry } from './memory/index'
import { buildSkillRegistry, type AgentContext } from './skills/index'
import { validateManifest } from './tools/validateManifest'
import { createReviewCodeTool } from './tools/reviewCode'
import { createRenderComponentTool } from './tools/renderComponent'
import { createWriteComponentTool } from './tools/writeComponent'
import { createReadManifestTool } from './tools/readManifest'
import { createReadProjectContextTool } from './tools/readProjectContext'
import { createSearchBlueprintsTool } from './tools/searchBlueprints'
import { getConfigValue } from '../ipc/config'

export interface EngineOptions {
  serverUrl: string
  serverApiKey: string
  sender: WebContents
  tabId: string
}

export interface RunInput {
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  targetComponentId?: string
}

export class AgentEngine {
  private registry: ReturnType<typeof buildRegistry>

  constructor(
    private config: LLMConfig,
    private projectDir: string,
    private options: EngineOptions
  ) {
    this.registry = buildRegistry(config)
  }

  async *stream(input: RunInput): AsyncGenerator<unknown> {
    // 1. Parse intent
    const intent = await parseIntent(input.message, this.config, this.registry)

    // 2. Load context
    const memory = await readMemory(this.projectDir)
    const projectCtx = await this.loadActiveComponents()

    const ctx: AgentContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      memory,
      activeComponents: projectCtx,
      targetComponentId: input.targetComponentId ?? intent.targetComponentId,
      conversationHistory: input.conversationHistory,
    }

    // 3. Build tools (injected with runtime dependencies)
    const tools = {
      validateManifest,
      reviewCode: createReviewCodeTool(this.registry, fastModelId(this.config)),
      renderComponent: createRenderComponentTool(this.options.sender, this.options.tabId),
      writeComponent: createWriteComponentTool(this.projectDir),
      readManifest: createReadManifestTool(this.projectDir),
      readProjectContext: createReadProjectContextTool(this.projectDir),
      searchBlueprints: createSearchBlueprintsTool(this.options.serverUrl, this.options.serverApiKey),
    }

    // 4. Select skill
    const skillRegistry = buildSkillRegistry(tools)
    const skill = skillRegistry[intent.skill]

    // 5. Stream
    const result = streamText({
      model: this.registry.languageModel(mainModelId(this.config)),
      system: skill.systemPrompt(ctx),
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
      tools: skill.tools,
      stopWhen: stepCountIs(skill.maxSteps ?? 10),
      maxTokens: skill.maxTokens,
      temperature: skill.temperature,
    })

    for await (const part of result.fullStream) {
      yield part
    }

    // 6. Post-process: write memory (fire-and-forget)
    const usage = await result.usage
    this.writeSessionMemory(intent.summary, usage).catch(() => {/* non-critical */})
  }

  private async loadActiveComponents(): Promise<Array<{ componentId: string; manifest: unknown }>> {
    const { readProjectContext } = await import('./tools/readProjectContext')
    // Use the tool directly to get components
    const tool = createReadProjectContextTool(this.projectDir)
    try {
      const ctx = await tool.execute!({ includeSourceSummaries: false }, {} as any)
      return (ctx as any).components ?? []
    } catch {
      return []
    }
  }

  private async writeSessionMemory(summary: string, usage: { totalTokens?: number } | null): Promise<void> {
    const date = new Date().toISOString().slice(0, 16)
    const tokens = usage?.totalTokens ?? 0
    await writeMemoryEntry(
      this.projectDir,
      'componentHistory',
      `[${date}] ${summary} (${tokens} tokens)`
    )
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- "engine.test"
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/engine.ts src/main/agent/__tests__/engine.test.ts
git commit -m "feat: add AgentEngine orchestrator (intent → skill → stream)"
```

---

## Task 8: Agent IPC Handler + Preload Channels

**Files:**
- Create: `src/main/agent/ipc.ts`
- Modify: `src/preload/channels.ts`
- Modify: `src/main/index.ts`

Wire the engine into Electron IPC. The renderer calls `agent:run` once and receives a stream of events via `agent:token`, `agent:tool-call`, etc.

- [ ] **Step 1: Update src/preload/channels.ts**

```typescript
export const ALLOWED_SEND_CHANNELS = [
  'bridge:fetch',
  'bridge:subscribe',
  'bridge:unsubscribe',
  'sandbox:load',
  'sandbox:unload'
] as const

export const ALLOWED_INVOKE_CHANNELS = [
  'bridge:fetch',
  'config:get',
  'config:set',
  'file:read',
  'file:write',
  'project:open',
  'project:save',
  'project:create',
  'project:list-recent',
  'component:read',
  'component:write',
  'component:list',
  'file:exists',
  'file:delete',
  'agent:run',
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
] as const

export type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
export type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
export type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]
```

- [ ] **Step 2: Create src/main/agent/ipc.ts**

```typescript
import type { IpcMain, WebContents } from 'electron'
import { AgentEngine } from './engine'
import { getConfigValue } from '../ipc/config'
import type { LLMConfig } from './providers'

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('agent:run', async (event, {
    message,
    projectDir,
    tabId,
    conversationHistory = [],
    targetComponentId,
  }: {
    message: string
    projectDir: string
    tabId: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
    targetComponentId?: string
  }) => {
    const sender: WebContents = event.sender

    // Load LLM config from secure storage
    const provider = (getConfigValue('llmProvider') as LLMConfig['provider']) ?? 'anthropic'
    const model = (getConfigValue('llmModel') as string) ?? 'claude-sonnet-4-6'
    const apiKey = (getConfigValue('llmApiKey') as string | null) ?? undefined
    const baseUrl = (getConfigValue('llmBaseUrl') as string | null) ?? undefined
    const serverUrl = (getConfigValue('serverUrl') as string) ?? 'http://localhost:3000'
    const serverApiKey = (getConfigValue('serverApiKey') as string | null) ?? ''

    const config: LLMConfig = { provider, model, apiKey, baseUrl }

    const engine = new AgentEngine(config, projectDir, {
      serverUrl,
      serverApiKey,
      sender,
      tabId,
    })

    try {
      for await (const part of engine.stream({ message, conversationHistory, targetComponentId })) {
        const p = part as Record<string, unknown>
        switch (p['type']) {
          case 'text-delta':
            sender.send('agent:token', { delta: p['textDelta'] })
            break
          case 'tool-call':
            sender.send('agent:tool-call', { tool: p['toolName'], input: p['input'] })
            break
          case 'tool-result':
            sender.send('agent:tool-result', { tool: p['toolName'], result: p['result'] })
            break
          case 'finish':
            sender.send('agent:done', { usage: p['usage'] })
            break
          case 'error':
            sender.send('agent:error', { message: String((p['error'] as Error)?.message ?? p['error']) })
            break
        }
      }
    } catch (err: unknown) {
      sender.send('agent:error', { message: err instanceof Error ? err.message : String(err) })
    }

    return { ok: true }
  })
}
```

- [ ] **Step 3: Register agent IPC in src/main/index.ts**

```typescript
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { register as registerConfig } from './ipc/config'
import { register as registerProject } from './ipc/project'
import { register as registerFile } from './ipc/file'
import { register as registerAgent } from './agent/ipc'

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (is.dev) {
    win.webContents.openDevTools()
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  installCSP()
  registerConfig(ipcMain)
  registerProject(ipcMain)
  registerFile(ipcMain)
  registerAgent(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: Run full typecheck**

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/ipc.ts src/preload/channels.ts src/main/index.ts
git commit -m "feat: wire agent IPC handler and preload channels"
```

---

## Task 9: Final Integration Verify

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected output:
```
✓ src/main/agent/__tests__/providers.test.ts (3)
✓ src/main/agent/__tests__/intent.test.ts (3)
✓ src/main/agent/memory/__tests__/memory.test.ts (8)
✓ src/main/agent/tools/__tests__/validateManifest.test.ts (2)
✓ src/main/agent/tools/__tests__/reviewCode.test.ts (2)
✓ src/main/agent/skills/__tests__/skills.test.ts (4)
✓ src/main/agent/__tests__/engine.test.ts (2)
...existing tests...

Test Files  X passed
Tests       X passed
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Verify Electron starts without error**

```bash
npm run dev
```

Expected: Electron window opens, no errors in terminal or DevTools console. Check that no IPC handler registration errors appear on startup.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Plan 05 complete — AI agent engine with skill system, memory, and IPC streaming"
```
