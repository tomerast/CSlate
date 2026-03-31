# Agent Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-skill agent engine with a three-tier Router > Orchestrator > Sub-Agent architecture that plans component work and dispatches parallel sub-agents for autonomous building.

**Architecture:** Tier 1 Router (fast model) classifies intent into "component work" vs "direct response". Tier 2 Orchestrator (top-tier model) runs a 7-phase loop: understand, search, plan, dispatch, assemble, validate, ship/fix. Tier 3 Sub-Agents are disposable `generateText` workers that build individual files in parallel.

**Tech Stack:** Vercel AI SDK (`streamText`, `generateText`, `generateObject`), Zod, Electron IPC, pino logging, vitest.

---

## File Structure

```
src/main/agent/
├── router.ts                         ← Tier 1 (replaces intent.ts)
├── orchestrator/
│   ├── index.ts                      ← Tier 2 orchestrator agent loop
│   ├── types.ts                      ← Orchestrator types (ComponentPlan, BuildTask, etc.)
│   ├── sub-agent.ts                  ← Sub-agent factory (spawnBuildAgent, spawnFixAgent)
│   └── prompts.ts                    ← Orchestrator system prompt builder
├── tools/
│   ├── ... (existing tools unchanged)
│   └── scanLocalComponents.ts        ← NEW: scan local components for similarity
├── ipc.ts                            ← Extended for multi-agent streaming
├── engine.ts                         ← Rewritten to use router + orchestrator
├── providers.ts                      ← Unchanged
├── memory/                           ← Unchanged
├── prompts/fragments.ts              ← Unchanged (reused by sub-agents)
├── skills/
│   ├── types.ts                      ← Unchanged
│   ├── state-wirer.ts                ← Kept
│   ├── component-search.ts           ← Kept
│   └── index.ts                      ← Reduced registry (2 skills only)
└── __tests__/
    ├── router.test.ts                ← NEW
    ├── orchestrator.test.ts          ← NEW
    ├── sub-agent.test.ts             ← NEW
    └── scan-local-components.test.ts ← NEW
```

---

### Task 1: Orchestrator Types

**Files:**
- Create: `src/main/agent/orchestrator/types.ts`
- Test: `src/main/agent/__tests__/orchestrator-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/orchestrator-types.test.ts
import { describe, it, expect } from 'vitest'
import { ComponentPlanSchema, BuildTaskSchema, SubAgentResultSchema, BlueprintMatchSchema } from '../orchestrator/types'

describe('Orchestrator types', () => {
  it('validates a minimal ComponentPlan', () => {
    const plan = {
      componentId: 'kanban_board',
      requirements: 'A kanban board with drag and drop',
      contract: 'interface Props { columns: Column[] }',
      tasks: [
        { file: 'ui.tsx', assignment: 'Build the main kanban UI', blueprint: null },
      ],
      blueprintMatch: null,
    }
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(true)
  })

  it('validates a BuildTask with blueprint', () => {
    const task = {
      file: 'ui.tsx',
      assignment: 'Adapt the card layout to use horizontal columns',
      blueprint: 'function Component(props) { return <div>card</div> }',
    }
    expect(BuildTaskSchema.safeParse(task).success).toBe(true)
  })

  it('validates a SubAgentResult', () => {
    const result = {
      file: 'ui.tsx',
      code: 'function Component(props) { return <div /> }',
      status: 'success' as const,
      error: null,
    }
    expect(SubAgentResultSchema.safeParse(result).success).toBe(true)
  })

  it('validates a BlueprintMatch', () => {
    const match = {
      componentId: 'server_kanban_123',
      name: 'Kanban Board',
      similarity: 0.87,
      source: { 'ui.tsx': 'function Component() {}', 'manifest.json': '{}' },
      strength: 'strong' as const,
    }
    expect(BlueprintMatchSchema.safeParse(match).success).toBe(true)
  })

  it('rejects ComponentPlan without tasks', () => {
    const plan = {
      componentId: 'test',
      requirements: 'test',
      contract: '',
      tasks: [],
      blueprintMatch: null,
    }
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/orchestrator-types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/agent/orchestrator/types.ts
import { z } from 'zod'
import type { MemoryFiles } from '../memory/index'

// --- Zod Schemas ---

export const BuildTaskSchema = z.object({
  file: z.string().describe('Filename to build, e.g. "ui.tsx", "logic.ts", "types.ts"'),
  assignment: z.string().describe('What to build or adapt in this file'),
  blueprint: z.string().nullable().describe('Base code to adapt, or null to build from scratch'),
})

export const BlueprintMatchSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  similarity: z.number().min(0).max(1),
  source: z.record(z.string()),
  strength: z.enum(['strong', 'weak', 'none']),
})

export const SubAgentResultSchema = z.object({
  file: z.string(),
  code: z.string(),
  status: z.enum(['success', 'error']),
  error: z.string().nullable(),
})

export const ComponentPlanSchema = z.object({
  componentId: z.string(),
  requirements: z.string(),
  contract: z.string().describe('Shared TypeScript interfaces / prop types'),
  tasks: z.array(BuildTaskSchema).min(1),
  blueprintMatch: BlueprintMatchSchema.nullable(),
})

// --- TypeScript Types ---

export type BuildTask = z.infer<typeof BuildTaskSchema>
export type BlueprintMatch = z.infer<typeof BlueprintMatchSchema>
export type SubAgentResult = z.infer<typeof SubAgentResultSchema>
export type ComponentPlan = z.infer<typeof ComponentPlanSchema>

export interface OrchestratorContext {
  projectDir: string
  tabId: string
  memory: MemoryFiles
  activeComponents: Array<{ componentId: string; manifest: unknown }>
  targetComponentId?: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  config: import('../providers').LLMConfig
  registry: { languageModel: (id: string) => any }
  serverClient: import('../../server/CSlateServerClient').CSlateServerClient | null
  sender: import('electron').WebContents
}

export type OrchestratorPhase =
  | 'understand'
  | 'search'
  | 'plan'
  | 'dispatch'
  | 'assemble'
  | 'validate'
  | 'ship'
  | 'fix'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/orchestrator-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/orchestrator/types.ts src/main/agent/__tests__/orchestrator-types.test.ts
git commit -m "feat(agent): add orchestrator type definitions and Zod schemas"
```

---

### Task 2: Router (Tier 1)

**Files:**
- Create: `src/main/agent/router.ts`
- Create: `src/main/agent/__tests__/router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/router.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

import { generateObject } from 'ai'
import { classifyIntent, type RouteResult } from '../router'

const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('classifyIntent', () => {
  it('routes component build request to orchestrator', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'orchestrator',
        summary: 'build a kanban board',
        targetComponentId: null,
      }
    } as any)

    const result = await classifyIntent('Build me a kanban board', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

    expect(result.route).toBe('orchestrator')
    expect(result.summary).toBe('build a kanban board')
  })

  it('routes modification request to orchestrator', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'orchestrator',
        summary: 'add dark mode to header',
        targetComponentId: 'header',
      }
    } as any)

    const result = await classifyIntent('Make the header darker', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

    expect(result.route).toBe('orchestrator')
    expect(result.targetComponentId).toBe('header')
  })

  it('routes state wiring to skill', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'skill',
        skill: 'state-wirer',
        summary: 'connect ticker to chart',
        targetComponentId: null,
      }
    } as any)

    const result = await classifyIntent('Wire the ticker output to the chart', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

    expect(result.route).toBe('skill')
    expect(result.skill).toBe('state-wirer')
  })

  it('routes general questions to direct', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'direct',
        summary: 'asking about settings',
        targetComponentId: null,
      }
    } as any)

    const result = await classifyIntent('How do I change my API key?', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

    expect(result.route).toBe('direct')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/agent/router.ts
import { generateObject } from 'ai'
import { z } from 'zod'
import type { LLMConfig } from './providers'
import { fastModelId } from './providers'
import { engineLog } from '../lib/logger'

const RouteSchema = z.object({
  route: z.enum(['orchestrator', 'skill', 'direct']),
  skill: z.enum(['state-wirer', 'component-search']).nullable().optional(),
  summary: z.string(),
  targetComponentId: z.string().nullable().optional(),
})

export type RouteResult = z.infer<typeof RouteSchema>

const ROUTER_SYSTEM = `You are the CSlate router. Classify the user's message into one of three routes:

- orchestrator: Any component work — building, modifying, styling, fixing, iterating on components. This includes: "build", "create", "add", "make", "update", "modify", "change", "fix", "restyle", "make it prettier", "I don't like", feedback on current result, etc.
- skill: Cross-component operations that don't build/modify a single component:
  - state-wirer: "connect", "wire", "link", "when X updates Y", "share data between"
  - component-search: "find", "search", "show me components", "browse", "what components exist"
- direct: General questions, settings help, non-component tasks.

targetComponentId: the snake_case ID of an existing component being referenced. Null if creating new or not applicable.
summary: one sentence describing what to do.`

export async function classifyIntent(
  message: string,
  config: LLMConfig,
  registry: { languageModel: (id: string) => any }
): Promise<RouteResult> {
  const modelId = fastModelId(config)
  const log = engineLog.child({ component: 'router' })
  log.debug({ modelId, message }, 'classifyIntent start')
  const t0 = Date.now()

  const { object } = await generateObject({
    model: registry.languageModel(modelId),
    system: ROUTER_SYSTEM,
    prompt: message,
    schema: RouteSchema,
  })

  log.debug({ modelId, durationMs: Date.now() - t0, route: object.route }, 'classifyIntent done')
  return object
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/router.ts src/main/agent/__tests__/router.test.ts
git commit -m "feat(agent): add Tier 1 router with orchestrator/skill/direct classification"
```

---

### Task 3: Sub-Agent Factory (Tier 3)

**Files:**
- Create: `src/main/agent/orchestrator/sub-agent.ts`
- Create: `src/main/agent/__tests__/sub-agent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/sub-agent.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

import { generateText } from 'ai'
import { spawnBuildAgent, spawnFixAgent, buildSubAgentPrompt } from '../orchestrator/sub-agent'
import type { BuildTask } from '../orchestrator/types'

const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('buildSubAgentPrompt', () => {
  it('includes contract and assignment', () => {
    const prompt = buildSubAgentPrompt({
      task: { file: 'ui.tsx', assignment: 'Build a kanban board', blueprint: null },
      contract: 'interface Props { columns: Column[] }',
    })
    expect(prompt).toContain('interface Props { columns: Column[] }')
    expect(prompt).toContain('Build a kanban board')
    expect(prompt).toContain('ui.tsx')
  })

  it('includes blueprint when provided', () => {
    const prompt = buildSubAgentPrompt({
      task: {
        file: 'ui.tsx',
        assignment: 'Adapt card layout',
        blueprint: 'function Component() { return <div>old</div> }',
      },
      contract: 'interface Props {}',
    })
    expect(prompt).toContain('function Component() { return <div>old</div> }')
    expect(prompt).toContain('ADAPT')
  })

  it('says build from scratch when no blueprint', () => {
    const prompt = buildSubAgentPrompt({
      task: { file: 'logic.ts', assignment: 'Build data hooks', blueprint: null },
      contract: 'interface Props {}',
    })
    expect(prompt).toContain('from scratch')
  })
})

describe('spawnBuildAgent', () => {
  it('returns SubAgentResult on success', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'function Component(props) { return <div>kanban</div> }',
    } as any)

    const result = await spawnBuildAgent({
      task: { file: 'ui.tsx', assignment: 'Build kanban UI', blueprint: null },
      contract: 'interface Props {}',
      modelId: 'anthropic:claude-sonnet-4-6',
      registry: mockRegistry,
    })

    expect(result.file).toBe('ui.tsx')
    expect(result.status).toBe('success')
    expect(result.code).toContain('kanban')
    expect(result.error).toBeNull()
  })

  it('returns error status on failure', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('API timeout'))

    const result = await spawnBuildAgent({
      task: { file: 'ui.tsx', assignment: 'Build UI', blueprint: null },
      contract: '',
      modelId: 'anthropic:claude-sonnet-4-6',
      registry: mockRegistry,
    })

    expect(result.status).toBe('error')
    expect(result.error).toContain('API timeout')
  })
})

describe('spawnFixAgent', () => {
  it('returns fixed code on success', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'function Component(props) { return <div>fixed</div> }',
    } as any)

    const result = await spawnFixAgent({
      file: 'ui.tsx',
      brokenCode: 'function Component(props) { return <div>broken',
      error: 'Unexpected end of input',
      contract: 'interface Props {}',
      modelId: 'anthropic:claude-sonnet-4-6',
      registry: mockRegistry,
    })

    expect(result.status).toBe('success')
    expect(result.code).toContain('fixed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/sub-agent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/agent/orchestrator/sub-agent.ts
import { generateText } from 'ai'
import { PLATFORM_KNOWLEDGE } from '../prompts/fragments'
import { stripFences } from '../lib/stripFences'
import type { BuildTask, SubAgentResult } from './types'
import { engineLog } from '../../lib/logger'

const log = engineLog.child({ component: 'sub-agent' })

const BUILD_SYSTEM = `You are a CSlate component file builder. You produce ONE file of production-quality React/TypeScript code for the CSlate platform.

Rules:
- Return ONLY the file content — no markdown fences, no explanations, no preamble.
- Follow the contract exactly. Do not add props or types not in the contract.
- Follow all platform rules below.

${PLATFORM_KNOWLEDGE}`

const FIX_SYSTEM = `You are a CSlate component fixer. You receive broken code and an error message. Fix the code and return ONLY the fixed file content — no markdown fences, no explanations.

${PLATFORM_KNOWLEDGE}`

export function buildSubAgentPrompt(params: {
  task: BuildTask
  contract: string
}): string {
  const { task, contract } = params
  const blueprintSection = task.blueprint
    ? `\n## BLUEPRINT — ADAPT this code to match the assignment:\n\`\`\`\n${task.blueprint}\n\`\`\``
    : '\n## No blueprint available — build from scratch.'

  return `## CONTRACT (shared types — follow exactly):\n\`\`\`typescript\n${contract}\n\`\`\`\n${blueprintSection}\n\n## ASSIGNMENT:\nBuild file \`${task.file}\`: ${task.assignment}`
}

export async function spawnBuildAgent(params: {
  task: BuildTask
  contract: string
  modelId: string
  registry: { languageModel: (id: string) => any }
}): Promise<SubAgentResult> {
  const { task, contract, modelId, registry } = params
  log.info({ file: task.file, hasBlueprint: !!task.blueprint }, 'build agent spawned')
  const t0 = Date.now()

  try {
    const prompt = buildSubAgentPrompt({ task, contract })
    const { text } = await generateText({
      model: registry.languageModel(modelId),
      system: BUILD_SYSTEM,
      prompt,
      maxOutputTokens: 8000,
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
}): Promise<SubAgentResult> {
  const { file, brokenCode, error, contract, modelId, registry } = params
  log.info({ file, error }, 'fix agent spawned')
  const t0 = Date.now()

  try {
    const prompt = `## CONTRACT:\n\`\`\`typescript\n${contract}\n\`\`\`\n\n## BROKEN CODE (file: ${file}):\n\`\`\`\n${brokenCode}\n\`\`\`\n\n## ERROR:\n${error}\n\nFix the code. Return ONLY the corrected file content.`

    const { text } = await generateText({
      model: registry.languageModel(modelId),
      system: FIX_SYSTEM,
      prompt,
      maxOutputTokens: 8000,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/sub-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/orchestrator/sub-agent.ts src/main/agent/__tests__/sub-agent.test.ts
git commit -m "feat(agent): add Tier 3 sub-agent factory with build and fix agents"
```

---

### Task 4: Scan Local Components Tool

**Files:**
- Create: `src/main/agent/tools/scanLocalComponents.ts`
- Create: `src/main/agent/__tests__/scan-local-components.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/scan-local-components.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/scan-local-components.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/agent/tools/scanLocalComponents.ts
import type { Tool } from 'ai'
import { z } from 'zod'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'

type ScanInput = { query: string }
type MatchEntry = {
  componentId: string
  name: string
  description: string
  tags: string[]
  source: Record<string, string>
  score: number
}
type ScanOutput = { matches: MatchEntry[] }

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1)
  )
}

function scoreMatch(queryTokens: Set<string>, name: string, description: string, tags: string[]): number {
  const targetText = `${name} ${description} ${tags.join(' ')}`
  const targetTokens = tokenize(targetText)
  let hits = 0
  for (const q of queryTokens) {
    for (const t of targetTokens) {
      if (t.includes(q) || q.includes(t)) { hits++; break }
    }
  }
  return queryTokens.size > 0 ? hits / queryTokens.size : 0
}

const SOURCE_FILES = ['ui.tsx', 'logic.ts', 'types.ts']

export function createScanLocalComponentsTool(projectDir: string): Tool<ScanInput, ScanOutput> {
  return {
    description: 'Scan local project components for ones similar to a query. Used as fallback when server search has no results.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of what you are looking for'),
    }) as any,
    execute: async (input: ScanInput): Promise<ScanOutput> => {
      const componentsDir = resolve(projectDir, 'components')
      if (!existsSync(componentsDir)) return { matches: [] }

      const dirs = (await readdir(componentsDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name)

      const queryTokens = tokenize(input.query)
      const scored: MatchEntry[] = []

      for (const dir of dirs) {
        const compDir = resolve(componentsDir, dir)
        if (!compDir.startsWith(componentsDir + '/')) continue
        const manifestPath = join(compDir, 'manifest.json')
        if (!existsSync(manifestPath)) continue

        const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
        const name = manifest.name ?? dir
        const description = manifest.description ?? ''
        const tags: string[] = manifest.tags ?? []

        const score = scoreMatch(queryTokens, name, description, tags)
        if (score < 0.3) continue

        const source: Record<string, string> = {}
        for (const file of SOURCE_FILES) {
          const filePath = join(compDir, file)
          if (existsSync(filePath)) {
            source[file] = await readFile(filePath, 'utf-8')
          }
        }

        scored.push({ componentId: dir, name, description, tags, source, score })
      }

      scored.sort((a, b) => b.score - a.score)
      return { matches: scored.slice(0, 5) }
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/scan-local-components.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/scanLocalComponents.ts src/main/agent/__tests__/scan-local-components.test.ts
git commit -m "feat(agent): add scanLocalComponents tool for local blueprint fallback"
```

---

### Task 5: Orchestrator Prompts

**Files:**
- Create: `src/main/agent/orchestrator/prompts.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/orchestrator-prompts.test.ts
import { describe, it, expect } from 'vitest'
import { buildOrchestratorSystemPrompt } from '../orchestrator/prompts'

describe('buildOrchestratorSystemPrompt', () => {
  it('includes platform knowledge', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      canvasContext: '',
    })
    expect(prompt).toContain('CSlate Platform Rules')
  })

  it('includes orchestrator role description', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      canvasContext: '',
    })
    expect(prompt).toContain('You are the CSlate Orchestrator')
    expect(prompt).toContain('You NEVER write component code yourself')
  })

  it('includes memory context when provided', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '### User Preferences\nPrefers dark themes',
      canvasContext: '',
    })
    expect(prompt).toContain('Prefers dark themes')
  })

  it('includes canvas context when provided', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      canvasContext: '- stock_ticker: "Stock Ticker"',
    })
    expect(prompt).toContain('stock_ticker')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/orchestrator-prompts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/agent/orchestrator/prompts.ts
import { PLATFORM_KNOWLEDGE, BEHAVIORAL_GUIDELINES, OUTPUT_STYLE } from '../prompts/fragments'

export function buildOrchestratorSystemPrompt(params: {
  memoryContext: string
  canvasContext: string
}): string {
  const { memoryContext, canvasContext } = params

  return `You are the CSlate Orchestrator — an autonomous agent that builds React components by planning and delegating to sub-agents.

## Your Role
You NEVER write component code yourself. You plan, delegate, validate, and ship. Your tools handle all execution.

## Workflow
1. UNDERSTAND — Parse the user's request. Extract what they want: component purpose, features, visual style, constraints.
2. SEARCH — Call searchBlueprints to find a matching community component. If found, evaluate match strength.
   - Strong match (>0.7 similarity): fetch full source, plan tasks as adaptations of the blueprint.
   - Weak match: use as structural reference.
   - No match: fall back to scanLocalComponents, then build from scratch.
3. PLAN — Call planComponent with:
   - componentId (snake_case)
   - requirements (what to build)
   - contract (TypeScript interfaces for shared types/props)
   - tasks (one per file: minimum ui.tsx, add logic.ts/types.ts only if warranted)
   - For each task: assignment + blueprint code (the actual file content from the match to adapt, or null)
4. DISPATCH — Call dispatchSubAgents. Sub-agents build all files in parallel. Wait for results.
5. VALIDATE — Call assembleAndValidate. This merges files, renders in sandbox, validates manifest.
   - If render succeeds → component is shipped automatically.
   - If render fails → you receive the error. Call dispatchFixAgents with the broken file(s) and error.
   - Max 2 fix cycles. After that, report the error to the user.

## Key Rules
- Always search before building. Blueprints are the primary acceleration mechanism.
- When a strong blueprint exists, tasks should be "adapt X" not "build from scratch". Pass the actual blueprint file content in each task's blueprint field.
- Keep the contract minimal — only types that are shared between files.
- Prefer fewer files. A simple component is just ui.tsx + manifest. Only add logic.ts if business logic is complex enough to separate.
- For modifications: read the existing component first (readManifest + readProjectContext), then plan adaptations.

${PLATFORM_KNOWLEDGE}
${BEHAVIORAL_GUIDELINES}
${OUTPUT_STYLE}
${memoryContext ? `\n## Project Memory\n${memoryContext}` : ''}
${canvasContext ? `\n## Components on Canvas\n${canvasContext}` : ''}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/orchestrator-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/orchestrator/prompts.ts src/main/agent/__tests__/orchestrator-prompts.test.ts
git commit -m "feat(agent): add orchestrator system prompt builder"
```

---

### Task 6: Orchestrator Agent Loop (Tier 2)

**Files:**
- Create: `src/main/agent/orchestrator/index.ts`
- Create: `src/main/agent/__tests__/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  generateObject: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
  tool: vi.fn((config) => config),
  createProviderRegistry: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
  })),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => vi.fn(() => ({}))) }))

import { streamText } from 'ai'
import { Orchestrator } from '../orchestrator/index'
import type { OrchestratorContext } from '../orchestrator/types'

const TEST_DIR = join(__dirname, '__orchestrator_test__')

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'agent', 'memory'), { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

function buildTestContext(): OrchestratorContext {
  return {
    projectDir: TEST_DIR,
    tabId: 'test-tab',
    memory: { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' },
    activeComponents: [],
    conversationHistory: [],
    config: { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
    registry: { languageModel: vi.fn().mockReturnValue({}) },
    serverClient: null,
    sender: { send: vi.fn() } as any,
  }
}

describe('Orchestrator', () => {
  it('creates an orchestrator with tools', () => {
    const ctx = buildTestContext()
    const orch = new Orchestrator(ctx)
    expect(orch).toBeDefined()
  })

  it('stream yields parts from the orchestrator agent loop', async () => {
    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Planning...' }
      yield { type: 'finish', usage: { totalTokens: 200 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 200 }),
    } as any)

    const ctx = buildTestContext()
    const orch = new Orchestrator(ctx)

    const parts: unknown[] = []
    for await (const part of orch.stream('Build a kanban board')) {
      parts.push(part)
    }

    expect(streamText).toHaveBeenCalledOnce()
    expect(parts.some((p: any) => p.type === 'text-delta')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/orchestrator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/agent/orchestrator/index.ts
import { streamText, stepCountIs, tool as defineTool } from 'ai'
import { z } from 'zod'
import type { OrchestratorContext, ComponentPlan, SubAgentResult } from './types'
import { ComponentPlanSchema } from './types'
import { buildOrchestratorSystemPrompt } from './prompts'
import { spawnBuildAgent, spawnFixAgent } from './sub-agent'
import { buildContextString } from '../memory/context-builder'
import { mainModelId } from '../providers'
import { createSearchBlueprintsTool } from '../tools/searchBlueprints'
import { createScanLocalComponentsTool } from '../tools/scanLocalComponents'
import { createReadProjectContextTool } from '../tools/readProjectContext'
import { createReadManifestTool } from '../tools/readManifest'
import { validateManifest } from '../tools/validateManifest'
import { createRenderComponentTool } from '../tools/renderComponent'
import { createWriteComponentTool } from '../tools/writeComponent'
import { stripFences } from '../lib/stripFences'
import { engineLog } from '../../lib/logger'

const MAX_FIX_CYCLES = 2

export class Orchestrator {
  private ctx: OrchestratorContext
  private log = engineLog.child({ component: 'orchestrator' })

  constructor(ctx: OrchestratorContext) {
    this.ctx = ctx
  }

  async *stream(message: string): AsyncGenerator<unknown> {
    const { ctx } = this
    const modelId = mainModelId(ctx.config)
    const memoryContext = buildContextString(ctx.memory)
    const canvasContext = ctx.activeComponents.length > 0
      ? ctx.activeComponents.map(c => `- ${c.componentId}: ${JSON.stringify((c.manifest as any).name)}`).join('\n')
      : ''

    const systemPrompt = buildOrchestratorSystemPrompt({ memoryContext, canvasContext })

    // Build orchestrator tools
    const tools = {
      searchBlueprints: createSearchBlueprintsTool(ctx.serverClient),
      scanLocalComponents: createScanLocalComponentsTool(ctx.projectDir),
      readProjectContext: createReadProjectContextTool(ctx.projectDir),
      readManifest: createReadManifestTool(ctx.projectDir),

      planComponent: defineTool({
        description: 'Define the component build plan. Call this after understanding requirements and searching for blueprints.',
        parameters: ComponentPlanSchema,
        execute: async (plan: ComponentPlan) => {
          this.log.info({ componentId: plan.componentId, taskCount: plan.tasks.length }, 'plan created')
          return { planned: true, componentId: plan.componentId, taskCount: plan.tasks.length }
        },
      }),

      dispatchSubAgents: defineTool({
        description: 'Dispatch parallel sub-agents to build all files in the plan. Each sub-agent builds one file. Returns results for all files.',
        parameters: z.object({
          componentId: z.string(),
          contract: z.string(),
          tasks: z.array(z.object({
            file: z.string(),
            assignment: z.string(),
            blueprint: z.string().nullable(),
          })),
        }),
        execute: async (input) => {
          this.log.info({ componentId: input.componentId, taskCount: input.tasks.length }, 'dispatching sub-agents')
          ctx.sender.send('agent:orchestrator:status', { phase: 'dispatch', workerCount: input.tasks.length })

          const results = await Promise.all(
            input.tasks.map((task, i) => {
              ctx.sender.send(`agent:worker:${i}:status`, { file: task.file, status: 'building' })
              return spawnBuildAgent({
                task,
                contract: input.contract,
                modelId,
                registry: ctx.registry,
              }).then(result => {
                ctx.sender.send(`agent:worker:${i}:done`, { file: task.file, status: result.status })
                return result
              })
            })
          )

          const succeeded = results.filter(r => r.status === 'success')
          const failed = results.filter(r => r.status === 'error')
          this.log.info({ succeeded: succeeded.length, failed: failed.length }, 'sub-agents done')
          return { results, succeeded: succeeded.length, failed: failed.length }
        },
      }),

      assembleAndValidate: defineTool({
        description: 'Assemble the component from sub-agent results, validate manifest, and render in sandbox. Call after dispatchSubAgents returns.',
        parameters: z.object({
          componentId: z.string(),
          results: z.array(z.object({
            file: z.string(),
            code: z.string(),
            status: z.enum(['success', 'error']),
            error: z.string().nullable(),
          })),
          manifest: z.any(),
          contextMd: z.string(),
        }),
        execute: async (input) => {
          this.log.info({ componentId: input.componentId }, 'assembling component')
          ctx.sender.send('agent:orchestrator:status', { phase: 'validate' })

          // Build files map from results
          const files: Record<string, string> = {}
          for (const r of input.results) {
            if (r.status === 'success') {
              files[r.file] = r.code
            }
          }

          if (!files['ui.tsx']) {
            return { success: false, error: 'ui.tsx build failed — cannot assemble component' }
          }

          // Validate manifest
          const validation = await validateManifest.execute!({ manifest: input.manifest }, {} as any)
          const v = validation as { valid: boolean; errors: string[] }
          if (!v.valid) {
            return { success: false, error: `Manifest invalid: ${v.errors.join(', ')}` }
          }

          // Render in sandbox
          const renderTool = createRenderComponentTool(ctx.sender, ctx.tabId)
          const renderResult = await renderTool.execute!({
            files: {
              'ui.tsx': files['ui.tsx'],
              ...(files['logic.ts'] ? { 'logic.ts': files['logic.ts'] } : {}),
              ...(files['types.ts'] ? { 'types.ts': files['types.ts'] } : {}),
            },
            manifest: input.manifest,
          }, {} as any)

          const rr = renderResult as { success: boolean; componentId: string }
          if (!rr.success) {
            return { success: false, error: 'Render failed' }
          }

          // Write to disk
          const writeTool = createWriteComponentTool(ctx.projectDir)
          await writeTool.execute!({
            componentId: input.componentId,
            files: {
              'ui.tsx': files['ui.tsx'],
              ...(files['logic.ts'] ? { 'logic.ts': files['logic.ts'] } : {}),
              ...(files['types.ts'] ? { 'types.ts': files['types.ts'] } : {}),
            },
            manifest: input.manifest,
            contextMd: input.contextMd,
          }, {} as any)

          ctx.sender.send('agent:orchestrator:status', { phase: 'ship' })
          this.log.info({ componentId: input.componentId }, 'component shipped')
          return { success: true, componentId: input.componentId }
        },
      }),

      dispatchFixAgents: defineTool({
        description: 'Dispatch fix sub-agents for files that failed to render. Returns fixed results.',
        parameters: z.object({
          contract: z.string(),
          fixes: z.array(z.object({
            file: z.string(),
            brokenCode: z.string(),
            error: z.string(),
          })),
        }),
        execute: async (input) => {
          this.log.info({ fixCount: input.fixes.length }, 'dispatching fix agents')
          ctx.sender.send('agent:orchestrator:status', { phase: 'fix' })

          const results = await Promise.all(
            input.fixes.map(fix =>
              spawnFixAgent({
                ...fix,
                contract: input.contract,
                modelId,
                registry: ctx.registry,
              })
            )
          )

          return { results }
        },
      }),
    }

    // Run the orchestrator agent loop
    this.log.info({ modelId, message }, 'orchestrator starting')
    ctx.sender.send('agent:orchestrator:status', { phase: 'understand' })
    const t0 = Date.now()

    const result = streamText({
      model: ctx.registry.languageModel(modelId),
      system: systemPrompt,
      messages: [
        ...ctx.conversationHistory,
        { role: 'user' as const, content: message },
      ],
      tools,
      stopWhen: stepCountIs(15),
      maxOutputTokens: 4000,
      temperature: 0.2,
    })

    for await (const part of result.fullStream) {
      yield part
    }

    this.log.info({ durationMs: Date.now() - t0 }, 'orchestrator done')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/orchestrator/index.ts src/main/agent/__tests__/orchestrator.test.ts
git commit -m "feat(agent): add Tier 2 orchestrator with planning tools and sub-agent dispatch"
```

---

### Task 7: Rewrite Engine to Use Router + Orchestrator

**Files:**
- Modify: `src/main/agent/engine.ts`
- Modify: `src/main/agent/__tests__/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/engine.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  generateText: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
  tool: vi.fn((config) => config),
  createProviderRegistry: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
  })),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => vi.fn(() => ({}))) }))

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

describe('AgentEngine.stream (v2 — router + orchestrator)', () => {
  it('routes component request to orchestrator', async () => {
    // Router returns orchestrator route
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'orchestrator', summary: 'build a button', targetComponentId: null }
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Planning...' }
      yield { type: 'finish', usage: { totalTokens: 100 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 100 }),
    } as any)

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

    expect(generateObject).toHaveBeenCalledOnce() // router
    expect(streamText).toHaveBeenCalledOnce() // orchestrator
  })

  it('routes skill request to legacy skill engine', async () => {
    // Router returns skill route
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'skill', skill: 'state-wirer', summary: 'wire ticker to chart', targetComponentId: null }
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Wiring...' }
      yield { type: 'finish', usage: { totalTokens: 50 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 50 }),
    } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    const parts: unknown[] = []
    for await (const part of engine.stream({ message: 'wire ticker to chart', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(generateObject).toHaveBeenCalledOnce()
    expect(streamText).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/engine.test.ts`
Expected: FAIL — router import not matching, or old tests fail

- [ ] **Step 3: Rewrite engine.ts**

```typescript
// src/main/agent/engine.ts
import { streamText, stepCountIs } from 'ai'
import type { WebContents } from 'electron'
import { buildRegistry, mainModelId, fastModelId, type LLMConfig } from './providers'
import { classifyIntent } from './router'
import { readMemory, writeMemoryEntry } from './memory/index'
import { buildSkillRegistry, type AgentContext } from './skills/index'
import { Orchestrator } from './orchestrator/index'
import type { OrchestratorContext } from './orchestrator/types'
import { validateManifest } from './tools/validateManifest'
import { createReviewCodeTool } from './tools/reviewCode'
import { createRenderComponentTool } from './tools/renderComponent'
import { createWriteComponentTool } from './tools/writeComponent'
import { createReadManifestTool } from './tools/readManifest'
import { createReadProjectContextTool } from './tools/readProjectContext'
import { createSearchBlueprintsTool } from './tools/searchBlueprints'
import { CSlateServerClient } from '../server/CSlateServerClient'
import { engineLog } from '../lib/logger'

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
    const log = engineLog.child({ tabId: this.options.tabId })

    // 1. Route intent
    log.debug({ message: input.message }, 'routing intent')
    const reg = this.registry as { languageModel: (id: string) => any }
    const route = await classifyIntent(input.message, this.config, reg)
    log.info({ route: route.route, skill: route.skill, summary: route.summary }, 'intent routed')

    // 2. Load context
    const memory = await readMemory(this.projectDir)
    const activeComponents = await this.loadActiveComponents()

    // 3. Dispatch based on route
    if (route.route === 'orchestrator') {
      // Tier 2: Orchestrator handles all component work
      const serverClient = (this.options.serverUrl && this.options.serverApiKey)
        ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
        : null

      const orchCtx: OrchestratorContext = {
        projectDir: this.projectDir,
        tabId: this.options.tabId,
        memory,
        activeComponents,
        targetComponentId: input.targetComponentId ?? route.targetComponentId ?? undefined,
        conversationHistory: input.conversationHistory,
        config: this.config,
        registry: reg,
        serverClient,
        sender: this.options.sender,
      }

      const orchestrator = new Orchestrator(orchCtx)
      const t0 = Date.now()
      for await (const part of orchestrator.stream(input.message)) {
        yield part
      }

      // Fire-and-forget memory write
      this.writeSessionMemory(route.summary, null).catch(() => {/* non-critical */})
      log.info({ durationMs: Date.now() - t0 }, 'orchestrator stream finished')

    } else if (route.route === 'skill' && route.skill) {
      // Legacy skill path (state-wirer, component-search)
      yield* this.runSkill(route.skill, input, memory, activeComponents, log)

    } else {
      // Direct response — simple question, no tools needed
      yield* this.runDirect(input, memory, log)
    }
  }

  private async *runSkill(
    skillName: string,
    input: RunInput,
    memory: Awaited<ReturnType<typeof readMemory>>,
    activeComponents: Array<{ componentId: string; manifest: unknown }>,
    log: ReturnType<typeof engineLog.child>
  ): AsyncGenerator<unknown> {
    const reg = this.registry as { languageModel: (id: string) => any }
    const serverClient = (this.options.serverUrl && this.options.serverApiKey)
      ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
      : null

    const ctx: AgentContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      memory,
      activeComponents,
      targetComponentId: input.targetComponentId,
      conversationHistory: input.conversationHistory,
    }

    const tools = {
      validateManifest,
      reviewCode: createReviewCodeTool(reg, fastModelId(this.config)),
      renderComponent: createRenderComponentTool(this.options.sender, this.options.tabId),
      writeComponent: createWriteComponentTool(this.projectDir),
      readManifest: createReadManifestTool(this.projectDir),
      readProjectContext: createReadProjectContextTool(this.projectDir),
      searchBlueprints: createSearchBlueprintsTool(serverClient),
    }

    const skillRegistry = buildSkillRegistry(tools)
    const skill = skillRegistry[skillName as keyof typeof skillRegistry]
    if (!skill) {
      yield { type: 'text-delta', textDelta: `Unknown skill: ${skillName}` }
      return
    }

    const modelId = mainModelId(this.config)
    log.info({ modelId, skill: skillName }, 'running legacy skill')
    const t0 = Date.now()

    const result = streamText({
      model: reg.languageModel(modelId),
      system: skill.systemPrompt(ctx),
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
      tools: skill.tools,
      stopWhen: stepCountIs(skill.maxSteps ?? 10),
      maxOutputTokens: skill.maxTokens,
      temperature: skill.temperature,
    })

    for await (const part of result.fullStream) {
      yield part
    }

    Promise.resolve(result.usage).then(usage => {
      log.info({ durationMs: Date.now() - t0, totalTokens: usage?.totalTokens }, 'skill stream finished')
    }).catch(() => {})
  }

  private async *runDirect(
    input: RunInput,
    memory: Awaited<ReturnType<typeof readMemory>>,
    log: ReturnType<typeof engineLog.child>
  ): AsyncGenerator<unknown> {
    const reg = this.registry as { languageModel: (id: string) => any }
    const modelId = mainModelId(this.config)
    log.info({ modelId }, 'running direct response')

    const result = streamText({
      model: reg.languageModel(modelId),
      system: 'You are the CSlate assistant. Answer the user\'s question helpfully and concisely. You do not have access to tools in this mode.',
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
      maxOutputTokens: 1000,
    })

    for await (const part of result.fullStream) {
      yield part
    }
  }

  private async loadActiveComponents(): Promise<Array<{ componentId: string; manifest: unknown }>> {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/engine.ts src/main/agent/__tests__/engine.test.ts
git commit -m "feat(agent): rewrite engine to use router + orchestrator architecture"
```

---

### Task 8: Reduce Skill Registry

**Files:**
- Modify: `src/main/agent/skills/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to existing intent.test.ts or create a new test verifying the reduced registry
// src/main/agent/__tests__/skill-registry.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  tool: vi.fn((config) => config),
}))

import { buildSkillRegistry } from '../skills/index'

describe('buildSkillRegistry (reduced)', () => {
  it('contains only state-wirer and component-search', () => {
    const registry = buildSkillRegistry({})
    const keys = Object.keys(registry)
    expect(keys).toContain('state-wirer')
    expect(keys).toContain('component-search')
    expect(keys).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/skill-registry.test.ts`
Expected: FAIL — registry still has 7 skills

- [ ] **Step 3: Update skills/index.ts**

```typescript
// src/main/agent/skills/index.ts
import type { Tool } from 'ai'
import type { SkillConfig } from './types'
import { stateWirerSkill } from './state-wirer'
import { componentSearchSkill } from './component-search'

export type { SkillConfig, AgentContext } from './types'

export type SkillName = 'state-wirer' | 'component-search'

export function buildSkillRegistry(tools: Record<string, Tool>): Record<SkillName, SkillConfig> {
  return {
    'state-wirer': stateWirerSkill(tools),
    'component-search': componentSearchSkill(tools),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/skill-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Run all agent tests to verify nothing broke**

Run: `npx vitest run src/main/agent/__tests__/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/skills/index.ts src/main/agent/__tests__/skill-registry.test.ts
git commit -m "refactor(agent): reduce skill registry to state-wirer and component-search only"
```

---

### Task 9: Extend IPC for Multi-Agent Streaming

**Files:**
- Modify: `src/main/agent/ipc.ts`
- Modify: `src/preload/channels.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/agent/__tests__/ipc-channels.test.ts
import { describe, it, expect } from 'vitest'
import { ALLOWED_SEND_CHANNELS } from '../../preload/channels'

describe('IPC channels', () => {
  it('includes orchestrator status channel', () => {
    expect(ALLOWED_SEND_CHANNELS).toContain('agent:orchestrator:status')
  })

  it('still includes existing agent channels', () => {
    expect(ALLOWED_SEND_CHANNELS).toContain('agent:token')
    expect(ALLOWED_SEND_CHANNELS).toContain('agent:tool-call')
    expect(ALLOWED_SEND_CHANNELS).toContain('agent:tool-result')
    expect(ALLOWED_SEND_CHANNELS).toContain('agent:done')
    expect(ALLOWED_SEND_CHANNELS).toContain('agent:error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/__tests__/ipc-channels.test.ts`
Expected: FAIL — `agent:orchestrator:status` not in allowed channels

- [ ] **Step 3: Update channels.ts to allow orchestrator channels**

Read `src/preload/channels.ts` first to see the exact format, then add the new channels:

Add `'agent:orchestrator:status'` to the `ALLOWED_SEND_CHANNELS` array.

Note: Worker-specific channels (`agent:worker:0:status`, etc.) use dynamic IDs, so the preload bridge needs a pattern-based allowlist or the orchestrator should send worker updates through `agent:orchestrator:status` with a `workerId` field. The simpler approach: funnel all worker updates through `agent:orchestrator:status`:

```typescript
// In channels.ts, add to ALLOWED_SEND_CHANNELS array:
'agent:orchestrator:status',
```

Then update `src/main/agent/orchestrator/index.ts` to send worker status through the orchestrator channel:

Replace `ctx.sender.send(\`agent:worker:${i}:status\`, ...)` with:
```typescript
ctx.sender.send('agent:orchestrator:status', { phase: 'worker', workerId: i, file: task.file, status: 'building' })
```

And replace `ctx.sender.send(\`agent:worker:${i}:done\`, ...)` with:
```typescript
ctx.sender.send('agent:orchestrator:status', { phase: 'worker', workerId: i, file: task.file, status: 'done' })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/__tests__/ipc-channels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/preload/channels.ts src/main/agent/orchestrator/index.ts src/main/agent/__tests__/ipc-channels.test.ts
git commit -m "feat(agent): extend IPC channels for orchestrator status streaming"
```

---

### Task 10: Delete Old Intent Module

**Files:**
- Delete: `src/main/agent/intent.ts`
- Delete: `src/main/agent/__tests__/intent.test.ts`
- Delete unused skill files: `component-builder.ts`, `component-modifier.ts`, `manifest-generator.ts`, `feedback-iterator.ts`, `style-applier.ts`

- [ ] **Step 1: Verify no imports reference old intent.ts**

Run: `grep -r "from.*intent" src/main/agent/ --include="*.ts" | grep -v __tests__ | grep -v node_modules`
Expected: Only `router.ts` or nothing. No remaining imports of `intent.ts`.

If `ipc.ts` still imports from intent, it was already updated in Task 7 (engine.ts rewrite handles routing).

- [ ] **Step 2: Delete old files**

```bash
rm src/main/agent/intent.ts
rm src/main/agent/__tests__/intent.test.ts
rm src/main/agent/skills/component-builder.ts
rm src/main/agent/skills/component-modifier.ts
rm src/main/agent/skills/manifest-generator.ts
rm src/main/agent/skills/feedback-iterator.ts
rm src/main/agent/skills/style-applier.ts
```

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `npx vitest run src/main/agent/__tests__/`
Expected: All tests PASS (old intent tests are gone, engine tests use router)

- [ ] **Step 4: Commit**

```bash
git add -A src/main/agent/
git commit -m "refactor(agent): remove old intent module and replaced skill files"
```

---

### Task 11: Integration Test — Full Orchestrator Flow

**Files:**
- Create: `src/main/agent/__tests__/orchestrator-integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// src/main/agent/__tests__/orchestrator-integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  generateText: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
  tool: vi.fn((config) => config),
  createProviderRegistry: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
  })),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => vi.fn(() => ({}))) }))

import { generateObject, streamText } from 'ai'
import { AgentEngine } from '../engine'

const TEST_PROJECT = join(__dirname, '__integration_test__')

beforeEach(() => {
  mkdirSync(join(TEST_PROJECT, 'agent', 'memory'), { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(TEST_PROJECT, { recursive: true, force: true })
})

describe('Full flow: user request → router → orchestrator → stream', () => {
  it('routes through orchestrator and streams output', async () => {
    // Router classifies as orchestrator
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'orchestrator', summary: 'build a todo list', targetComponentId: null }
    } as any)

    // Orchestrator streams planning + tool calls
    const mockStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'I will build a todo list component.' }
      yield { type: 'tool-call', toolName: 'searchBlueprints', input: { query: 'todo list', limit: 5 } }
      yield { type: 'tool-result', toolName: 'searchBlueprints', result: { results: [] } }
      yield { type: 'text-delta', textDelta: ' No blueprint found, building from scratch.' }
      yield { type: 'finish', usage: { totalTokens: 500 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockStream,
      usage: Promise.resolve({ totalTokens: 500 }),
    } as any)

    const sender = { send: vi.fn() }
    const engine = new AgentEngine(
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      TEST_PROJECT,
      { serverUrl: 'http://localhost:3000', serverApiKey: 'test', sender: sender as any, tabId: 'tab1' }
    )

    const parts: any[] = []
    for await (const part of engine.stream({ message: 'Build me a todo list', conversationHistory: [] })) {
      parts.push(part)
    }

    // Router was called
    expect(generateObject).toHaveBeenCalledOnce()
    // Orchestrator streamText was called
    expect(streamText).toHaveBeenCalledOnce()
    // Got text deltas
    expect(parts.filter(p => p.type === 'text-delta').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run src/main/agent/__tests__/orchestrator-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/agent/__tests__/orchestrator-integration.test.ts
git commit -m "test(agent): add orchestrator integration test for full router→orchestrator flow"
```

---

### Task 12: Update Renderer useChat for Orchestrator Status

**Files:**
- Modify: `src/renderer/chat/useChat.ts`

- [ ] **Step 1: Add orchestrator status listener**

Add a listener for `agent:orchestrator:status` that updates a status indicator in the chat store. This shows the user which phase the orchestrator is in.

```typescript
// In useChat.ts, inside the submit function, after the offToolResult listener:

const offOrchestratorStatus = window.electron.on('agent:orchestrator:status', (data: unknown) => {
  const d = data as { phase: string; workerId?: number; file?: string; status?: string; workerCount?: number }
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
  const label = phaseLabels[d.phase] ?? d.phase
  useChatStore.setState({ statusLabel: label })
})
```

Add `offOrchestratorStatus()` to the `finally` block alongside the other cleanup calls.

- [ ] **Step 2: Add statusLabel to chatStore**

In `src/renderer/store/chatStore.ts`, add `statusLabel: string` to the store state with default `''`, and expose it:

```typescript
statusLabel: '',
setStatusLabel: (label: string) => set({ statusLabel: label }),
```

- [ ] **Step 3: Verify the chat panel renders the status label**

This is a UI concern — verify `ChatPanel.tsx` or `MessageList.tsx` displays `statusLabel` when `status === 'generating'`. If not already wired, add a small status indicator.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/chat/useChat.ts src/renderer/store/chatStore.ts
git commit -m "feat(renderer): show orchestrator phase status in chat UI"
```
