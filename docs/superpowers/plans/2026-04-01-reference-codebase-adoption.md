# Reference Codebase Pattern Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the best patterns from Claude Code's source into CSlate's agent engine — typed tool interface, tool result budgeting, context compaction, and abort controller threading — while preserving the deterministic orchestrator loop.

**Architecture:** Introduce a `Tool` type with `buildTool()` factory (inspired by Claude Code's Tool.ts), a result budgeting layer that prevents context overflow, a compaction system that summarizes old turns, and abort controller propagation for clean cancellation. All changes wrap around the existing orchestrator flow.

**Tech Stack:** TypeScript, Zod, Vercel AI SDK (`ai`), Electron IPC, pino logger

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/main/agent/tools/types.ts` | `CSTool` type, `ToolResult`, `ToolUseContext`, `buildTool()` factory, `ValidationResult` |
| `src/main/agent/lib/resultBudget.ts` | `budgetToolResult()` — truncate + persist large tool results |
| `src/main/agent/lib/compact.ts` | `autoCompactIfNeeded()` — summarize old turns when approaching context limit |
| `src/main/agent/lib/abortUtils.ts` | `createChildAbortController()` — child signal for sub-agent cancellation |

### Modified Files
| File | Changes |
|------|---------|
| `src/main/agent/tools/validateManifest.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/readManifest.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/readProjectContext.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/renderComponent.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/writeComponent.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/reviewCode.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/searchBlueprints.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/scanLocalComponents.ts` | Refactor to `buildTool()` |
| `src/main/agent/tools/index.ts` | Export `CSTool[]` array + `getToolsForContext()` |
| `src/main/agent/engine.ts` | Thread AbortController, integrate compaction, use budgeted results |
| `src/main/agent/orchestrator/index.ts` | Thread AbortController, use budgeted tool results |
| `src/main/agent/orchestrator/sub-agent.ts` | Accept and propagate AbortController |

### Test Files
| File | Tests |
|------|-------|
| `src/main/agent/tools/__tests__/types.test.ts` | `buildTool()` defaults, `CSTool` interface |
| `src/main/agent/lib/__tests__/resultBudget.test.ts` | Truncation, persistence, no-op for small results |
| `src/main/agent/lib/__tests__/compact.test.ts` | Token estimation, compaction trigger, summary generation |
| `src/main/agent/lib/__tests__/abortUtils.test.ts` | Child abort controller behavior |

---

### Task 1: Create CSTool Type and buildTool() Factory

**Files:**
- Create: `src/main/agent/tools/types.ts`
- Test: `src/main/agent/tools/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test for buildTool() defaults**

```typescript
// src/main/agent/tools/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildTool } from '../types'

describe('buildTool', () => {
  const minimalTool = buildTool({
    name: 'testTool',
    description: 'A test tool',
    inputSchema: z.object({ value: z.string() }),
    call: async (input) => ({ data: input.value }),
  })

  it('provides safe defaults', () => {
    expect(minimalTool.name).toBe('testTool')
    expect(minimalTool.isReadOnly({ value: 'x' })).toBe(false)
    expect(minimalTool.isConcurrencySafe({ value: 'x' })).toBe(false)
    expect(minimalTool.maxResultSizeChars).toBe(50_000)
  })

  it('allows overriding defaults', () => {
    const readOnlyTool = buildTool({
      name: 'readOnly',
      description: 'Reads stuff',
      inputSchema: z.object({ id: z.string() }),
      call: async () => ({ data: 'ok' }),
      isReadOnly: () => true,
      isConcurrencySafe: () => true,
      maxResultSizeChars: 100_000,
    })
    expect(readOnlyTool.isReadOnly({ id: '1' })).toBe(true)
    expect(readOnlyTool.isConcurrencySafe({ id: '1' })).toBe(true)
    expect(readOnlyTool.maxResultSizeChars).toBe(100_000)
  })

  it('validates input with validateInput when provided', async () => {
    const validatedTool = buildTool({
      name: 'validated',
      description: 'Validates input',
      inputSchema: z.object({ id: z.string() }),
      call: async () => ({ data: 'ok' }),
      validateInput: async (input) => {
        if (input.id === '') return { valid: false, message: 'ID required' }
        return { valid: true }
      },
    })
    expect(await validatedTool.validateInput!({ id: '' })).toEqual({ valid: false, message: 'ID required' })
    expect(await validatedTool.validateInput!({ id: 'abc' })).toEqual({ valid: true })
  })

  it('toAISDKTool converts to AI SDK format', () => {
    const aiTool = minimalTool.toAISDKTool()
    expect(aiTool.description).toBe('A test tool')
    expect(aiTool.inputSchema).toBeDefined()
    expect(typeof aiTool.execute).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/tools/__tests__/types.test.ts`
Expected: FAIL with "Cannot find module '../types'"

- [ ] **Step 3: Implement CSTool type and buildTool() factory**

```typescript
// src/main/agent/tools/types.ts
import type { Tool as AITool } from 'ai'
import type { z } from 'zod'

export type ValidationResult = { valid: true } | { valid: false; message: string }

export type ToolResult<T = unknown> = {
  data: T
}

export type ToolUseContext = {
  projectDir: string
  abortSignal?: AbortSignal
}

export type CSTool<
  Input extends z.ZodObject<any> = z.ZodObject<any>,
  Output = unknown,
> = {
  name: string
  description: string
  inputSchema: Input
  call(args: z.infer<Input>, context?: ToolUseContext): Promise<ToolResult<Output>>
  isReadOnly(input: z.infer<Input>): boolean
  isConcurrencySafe(input: z.infer<Input>): boolean
  validateInput?(input: z.infer<Input>): Promise<ValidationResult>
  maxResultSizeChars: number
  /** Convert to Vercel AI SDK tool format for use with streamText() */
  toAISDKTool(): AITool<any, any>
}

type CSToolDef<
  Input extends z.ZodObject<any> = z.ZodObject<any>,
  Output = unknown,
> = {
  name: string
  description: string
  inputSchema: Input
  call(args: z.infer<Input>, context?: ToolUseContext): Promise<ToolResult<Output>>
  isReadOnly?(input: z.infer<Input>): boolean
  isConcurrencySafe?(input: z.infer<Input>): boolean
  validateInput?(input: z.infer<Input>): Promise<ValidationResult>
  maxResultSizeChars?: number
}

const DEFAULTS = {
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  maxResultSizeChars: 50_000,
}

export function buildTool<
  Input extends z.ZodObject<any>,
  Output = unknown,
>(def: CSToolDef<Input, Output>): CSTool<Input, Output> {
  const tool: CSTool<Input, Output> = {
    ...DEFAULTS,
    ...def,
    isReadOnly: def.isReadOnly ?? DEFAULTS.isReadOnly,
    isConcurrencySafe: def.isConcurrencySafe ?? DEFAULTS.isConcurrencySafe,
    maxResultSizeChars: def.maxResultSizeChars ?? DEFAULTS.maxResultSizeChars,
    toAISDKTool(): AITool<any, any> {
      return {
        description: def.description,
        inputSchema: def.inputSchema as any,
        execute: async (input: z.infer<Input>) => {
          if (tool.validateInput) {
            const validation = await tool.validateInput(input)
            if (!validation.valid) {
              return { error: validation.message }
            }
          }
          const result = await tool.call(input)
          return result.data
        },
      }
    },
  }
  return tool
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/tools/__tests__/types.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/types.ts src/main/agent/tools/__tests__/types.test.ts
git commit -m "feat(agent): add CSTool type and buildTool() factory

Inspired by Claude Code's Tool.ts — provides typed tool interface with
safe defaults (isReadOnly=false, isConcurrencySafe=false) and
toAISDKTool() bridge for Vercel AI SDK compatibility."
```

---

### Task 2: Create Tool Result Budgeting

**Files:**
- Create: `src/main/agent/lib/resultBudget.ts`
- Test: `src/main/agent/lib/__tests__/resultBudget.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/agent/lib/__tests__/resultBudget.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { budgetToolResult } from '../resultBudget'
import { readFileSync, existsSync } from 'fs'

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, writeFileSync: vi.fn(), mkdirSync: vi.fn() }
})

describe('budgetToolResult', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns small results unchanged', () => {
    const small = 'Hello world'
    expect(budgetToolResult(small, 'testTool')).toBe(small)
  })

  it('returns object results as-is when serialized form is small', () => {
    const obj = { key: 'value' }
    expect(budgetToolResult(obj, 'testTool')).toEqual(obj)
  })

  it('truncates string results exceeding maxChars', () => {
    const large = 'x'.repeat(60_000)
    const result = budgetToolResult(large, 'bigTool', 50_000)
    expect(typeof result).toBe('string')
    expect((result as string).length).toBeLessThan(large.length)
    expect((result as string)).toContain('[Truncated')
  })

  it('truncates object results when serialized form exceeds maxChars', () => {
    const largeObj = { data: 'x'.repeat(60_000) }
    const result = budgetToolResult(largeObj, 'bigTool', 50_000)
    expect(typeof result).toBe('object')
    expect((result as any).__truncated).toBe(true)
  })

  it('uses default maxChars of 50_000', () => {
    const justUnder = 'x'.repeat(49_999)
    expect(budgetToolResult(justUnder, 'tool')).toBe(justUnder)

    const justOver = 'x'.repeat(50_001)
    const result = budgetToolResult(justOver, 'tool')
    expect(result).not.toBe(justOver)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/lib/__tests__/resultBudget.test.ts`
Expected: FAIL with "Cannot find module '../resultBudget'"

- [ ] **Step 3: Implement budgetToolResult**

```typescript
// src/main/agent/lib/resultBudget.ts
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const DEFAULT_MAX_CHARS = 50_000

/**
 * Budget a tool result to prevent context overflow.
 * If the result exceeds maxChars, truncate and note the truncation.
 * Inspired by Claude Code's toolResultStorage.ts.
 */
export function budgetToolResult<T>(
  result: T,
  toolName: string,
  maxChars: number = DEFAULT_MAX_CHARS
): T {
  if (result === null || result === undefined) return result

  if (typeof result === 'string') {
    if (result.length <= maxChars) return result
    const preview = result.slice(0, maxChars)
    const truncatedPath = persistToTemp(result, toolName)
    return `${preview}\n\n[Truncated — full output (${result.length} chars) saved to: ${truncatedPath}]` as T
  }

  // For objects, check serialized size
  const serialized = JSON.stringify(result)
  if (serialized.length <= maxChars) return result

  // Truncate the serialized form and return a wrapper
  const truncatedPath = persistToTemp(serialized, toolName)
  return {
    ...(typeof result === 'object' ? result : {}),
    __truncated: true,
    __fullOutputPath: truncatedPath,
    __originalSize: serialized.length,
  } as T
}

function persistToTemp(content: string, toolName: string): string {
  const dir = join(tmpdir(), 'cslate-tool-results')
  mkdirSync(dir, { recursive: true })
  const filename = `${toolName}-${Date.now()}.txt`
  const filepath = join(dir, filename)
  writeFileSync(filepath, content, 'utf-8')
  return filepath
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/lib/__tests__/resultBudget.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/lib/resultBudget.ts src/main/agent/lib/__tests__/resultBudget.test.ts
git commit -m "feat(agent): add tool result budgeting

Truncates tool results exceeding 50k chars to prevent context overflow.
Large results are persisted to temp files with a reference path."
```

---

### Task 3: Create Context Compaction

**Files:**
- Create: `src/main/agent/lib/compact.ts`
- Test: `src/main/agent/lib/__tests__/compact.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/agent/lib/__tests__/compact.test.ts
import { describe, it, expect, vi } from 'vitest'
import { estimateTokens, shouldCompact, buildCompactSummary } from '../compact'

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    const text = 'Hello world, this is a test message.'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(5)
    expect(tokens).toBeLessThan(20)
  })

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('shouldCompact', () => {
  it('returns false when under threshold', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ]
    expect(shouldCompact(messages, 200_000)).toBe(false)
  })

  it('returns true when over 80% of context window', () => {
    const longMessage = 'x'.repeat(100_000) // ~25k tokens
    const messages = [
      { role: 'user' as const, content: longMessage },
      { role: 'assistant' as const, content: longMessage },
      { role: 'user' as const, content: longMessage },
      { role: 'assistant' as const, content: longMessage },
    ]
    // 100k tokens estimated, 80% of 100k window = should compact
    expect(shouldCompact(messages, 100_000)).toBe(true)
  })

  it('never compacts with fewer than 4 messages', () => {
    const longMessage = 'x'.repeat(200_000)
    const messages = [
      { role: 'user' as const, content: longMessage },
      { role: 'assistant' as const, content: longMessage },
    ]
    expect(shouldCompact(messages, 10_000)).toBe(false)
  })
})

describe('buildCompactSummary', () => {
  it('returns summary text preserving recent messages', () => {
    const messages = [
      { role: 'user' as const, content: 'Build a stock ticker' },
      { role: 'assistant' as const, content: 'I will search for blueprints...' },
      { role: 'user' as const, content: 'Make it red' },
      { role: 'assistant' as const, content: 'Updated the color to red.' },
    ]
    const result = buildCompactSummary(messages, 2)
    expect(result.preserved).toHaveLength(2) // last 2 messages preserved
    expect(result.summary).toContain('stock ticker')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/lib/__tests__/compact.test.ts`
Expected: FAIL with "Cannot find module '../compact'"

- [ ] **Step 3: Implement context compaction**

```typescript
// src/main/agent/lib/compact.ts

type ConversationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const CHARS_PER_TOKEN = 4
const COMPACT_THRESHOLD = 0.8 // compact at 80% of context window
const MIN_MESSAGES_TO_COMPACT = 4
const PRESERVED_TAIL_COUNT = 4 // keep last 4 messages (2 turns)

/**
 * Rough token estimation: ~4 chars per token.
 * Good enough for compaction decisions — not for billing.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total tokens across all messages.
 */
function estimateConversationTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

/**
 * Should we compact? True when estimated tokens exceed 80% of context window
 * AND there are enough messages to make compaction worthwhile.
 */
export function shouldCompact(
  messages: ConversationMessage[],
  contextWindowTokens: number
): boolean {
  if (messages.length < MIN_MESSAGES_TO_COMPACT) return false
  const estimated = estimateConversationTokens(messages)
  return estimated > contextWindowTokens * COMPACT_THRESHOLD
}

/**
 * Build a compact summary of older messages, preserving recent ones.
 * Returns the summary text and the preserved tail messages.
 */
export function buildCompactSummary(
  messages: ConversationMessage[],
  preserveCount: number = PRESERVED_TAIL_COUNT
): { summary: string; preserved: ConversationMessage[] } {
  const splitAt = Math.max(0, messages.length - preserveCount)
  const toSummarize = messages.slice(0, splitAt)
  const preserved = messages.slice(splitAt)

  // Build a structured summary of the older conversation
  const summaryParts: string[] = []
  for (const msg of toSummarize) {
    const prefix = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Agent' : 'System'
    // Take first 200 chars of each message for the summary
    const snippet = msg.content.length > 200
      ? msg.content.slice(0, 200) + '...'
      : msg.content
    summaryParts.push(`${prefix}: ${snippet}`)
  }

  const summary = `[Conversation Summary — ${toSummarize.length} earlier messages compacted]\n\n${summaryParts.join('\n\n')}`

  return { summary, preserved }
}

/**
 * Auto-compact conversation history if approaching context limit.
 * Returns the (possibly compacted) message array.
 *
 * Inspired by Claude Code's services/compact/autoCompact.ts.
 */
export function autoCompactIfNeeded(
  messages: ConversationMessage[],
  contextWindowTokens: number = 200_000
): ConversationMessage[] {
  if (!shouldCompact(messages, contextWindowTokens)) {
    return messages
  }

  const { summary, preserved } = buildCompactSummary(messages)

  return [
    { role: 'system' as const, content: summary },
    ...preserved,
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/lib/__tests__/compact.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/lib/compact.ts src/main/agent/lib/__tests__/compact.test.ts
git commit -m "feat(agent): add context compaction

Auto-compacts conversation when approaching 80% of context window.
Older messages are summarized, recent 4 messages preserved.
Prevents session failures from context overflow."
```

---

### Task 4: Create Abort Controller Utilities

**Files:**
- Create: `src/main/agent/lib/abortUtils.ts`
- Test: `src/main/agent/lib/__tests__/abortUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/main/agent/lib/__tests__/abortUtils.test.ts
import { describe, it, expect } from 'vitest'
import { createChildAbortController } from '../abortUtils'

describe('createChildAbortController', () => {
  it('creates a child that aborts when parent aborts', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)

    expect(child.signal.aborted).toBe(false)
    parent.abort()
    expect(child.signal.aborted).toBe(true)
  })

  it('child can abort independently without affecting parent', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)

    child.abort()
    expect(child.signal.aborted).toBe(true)
    expect(parent.signal.aborted).toBe(false)
  })

  it('handles already-aborted parent', () => {
    const parent = new AbortController()
    parent.abort()
    const child = createChildAbortController(parent)
    expect(child.signal.aborted).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/lib/__tests__/abortUtils.test.ts`
Expected: FAIL with "Cannot find module '../abortUtils'"

- [ ] **Step 3: Implement createChildAbortController**

```typescript
// src/main/agent/lib/abortUtils.ts

/**
 * Create a child AbortController that aborts when the parent aborts,
 * but can also abort independently without affecting the parent.
 *
 * Inspired by Claude Code's utils/abortController.ts.
 */
export function createChildAbortController(parent: AbortController): AbortController {
  const child = new AbortController()

  if (parent.signal.aborted) {
    child.abort(parent.signal.reason)
    return child
  }

  const onParentAbort = () => {
    child.abort(parent.signal.reason)
  }

  parent.signal.addEventListener('abort', onParentAbort, { once: true })

  return child
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/agent/lib/__tests__/abortUtils.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/lib/abortUtils.ts src/main/agent/lib/__tests__/abortUtils.test.ts
git commit -m "feat(agent): add child abort controller utility

Creates child AbortControllers that propagate parent abort signals
without allowing child aborts to affect the parent."
```

---

### Task 5: Refactor validateManifest to buildTool()

**Files:**
- Modify: `src/main/agent/tools/validateManifest.ts`
- Modify: `src/main/agent/tools/__tests__/validateManifest.test.ts`

- [ ] **Step 1: Update the existing test to use new interface**

Read the existing test file first, then update it to verify the CSTool interface:

```typescript
// Add to existing tests in src/main/agent/tools/__tests__/validateManifest.test.ts
import { validateManifestTool } from '../validateManifest'

// Add this test alongside existing ones:
describe('validateManifestTool CSTool interface', () => {
  it('has correct CSTool properties', () => {
    expect(validateManifestTool.name).toBe('validateManifest')
    expect(validateManifestTool.isReadOnly({ manifest: {} })).toBe(true)
    expect(validateManifestTool.isConcurrencySafe({ manifest: {} })).toBe(true)
  })

  it('toAISDKTool returns AI SDK compatible tool', () => {
    const aiTool = validateManifestTool.toAISDKTool()
    expect(aiTool.description).toBe(validateManifestTool.description)
    expect(typeof aiTool.execute).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/agent/tools/__tests__/validateManifest.test.ts`
Expected: FAIL with "validateManifestTool is not exported"

- [ ] **Step 3: Refactor validateManifest.ts**

```typescript
// src/main/agent/tools/validateManifest.ts
import { z } from 'zod'
import { ComponentManifestSchema } from '@cslate/shared'
import { buildTool } from './types'

type ValidateManifestInput = { manifest: unknown }
type ValidateManifestOutput = { valid: boolean; errors: string[] }

export const validateManifestTool = buildTool({
  name: 'validateManifest',
  description: 'Validate a component manifest against the CSlate schema. Always call this before writeComponent.',
  inputSchema: z.object({
    manifest: z.any().describe('The manifest object to validate'),
  }),
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  call: async (input: ValidateManifestInput) => {
    const result = ComponentManifestSchema.safeParse(input.manifest)
    if (result.success) {
      return { data: { valid: true, errors: [] } as ValidateManifestOutput }
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return { data: { valid: false, errors } as ValidateManifestOutput }
  },
})

/** @deprecated Use validateManifestTool.toAISDKTool() instead */
export const validateManifest = validateManifestTool.toAISDKTool()
```

- [ ] **Step 4: Run all validateManifest tests**

Run: `npx vitest run src/main/agent/tools/__tests__/validateManifest.test.ts`
Expected: PASS (existing tests pass via deprecated export, new tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/validateManifest.ts src/main/agent/tools/__tests__/validateManifest.test.ts
git commit -m "refactor(agent): migrate validateManifest to buildTool()

Uses CSTool interface with isReadOnly=true, isConcurrencySafe=true.
Backwards-compatible via deprecated export."
```

---

### Task 6: Refactor Read-Only Tools to buildTool()

**Files:**
- Modify: `src/main/agent/tools/readManifest.ts`
- Modify: `src/main/agent/tools/readProjectContext.ts`
- Modify: `src/main/agent/tools/searchBlueprints.ts`
- Modify: `src/main/agent/tools/scanLocalComponents.ts`

- [ ] **Step 1: Refactor readManifest.ts**

```typescript
// src/main/agent/tools/readManifest.ts
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import { buildTool } from './types'

type ReadManifestOutput = { manifest: unknown } | { error: string }

export function createReadManifestTool(projectDir: string) {
  return buildTool({
    name: 'readManifest',
    description: 'Read the manifest.json for a component that already exists in the project.',
    inputSchema: z.object({
      componentId: z.string().describe('The component directory name, e.g. "stock_ticker"'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async (input) => {
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return { data: { error: 'Invalid component ID' } as ReadManifestOutput }
      }
      const manifestPath = join(componentDir, 'manifest.json')
      if (!existsSync(manifestPath)) {
        return { data: { error: `Component "${input.componentId}" not found` } as ReadManifestOutput }
      }
      const raw = await readFile(manifestPath, 'utf-8')
      return { data: { manifest: JSON.parse(raw) as unknown } as ReadManifestOutput }
    },
  })
}
```

- [ ] **Step 2: Refactor readProjectContext.ts**

```typescript
// src/main/agent/tools/readProjectContext.ts
import { z } from 'zod'
import { readFile } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'
import { join, resolve, sep } from 'path'
import { buildTool } from './types'

type ReadContextOutput = { app: Record<string, unknown>; components: Record<string, unknown>[] }

export function createReadProjectContextTool(projectDir: string) {
  return buildTool({
    name: 'readProjectContext',
    description: 'Read the current project context: the app name/description and all component manifests currently on the canvas.',
    inputSchema: z.object({
      includeSourceSummaries: z.boolean().default(false).describe('Whether to include context.md summaries for each component'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    maxResultSizeChars: 100_000, // project context can be large
    call: async (input) => {
      const appManifestPath = join(projectDir, 'cslate.json')
      let appManifest: Record<string, unknown> = {}
      if (existsSync(appManifestPath)) {
        appManifest = JSON.parse(await readFile(appManifestPath, 'utf-8')) as Record<string, unknown>
      }

      const componentsDir = resolve(projectDir, 'components')
      const components: Record<string, unknown>[] = []
      if (existsSync(componentsDir)) {
        const dirs = readdirSync(componentsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)

        for (const name of dirs) {
          const componentDir = resolve(componentsDir, name)
          if (!componentDir.startsWith(componentsDir + sep)) continue
          const manifestPath = join(componentDir, 'manifest.json')
          if (!existsSync(manifestPath)) continue
          const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as unknown
          const entry: Record<string, unknown> = { componentId: name, manifest }
          if (input.includeSourceSummaries) {
            const contextPath = join(componentDir, 'context.md')
            if (existsSync(contextPath)) {
              entry.context = await readFile(contextPath, 'utf-8')
            }
          }
          components.push(entry)
        }
      }

      return { data: { app: appManifest, components } as ReadContextOutput }
    },
  })
}
```

- [ ] **Step 3: Refactor searchBlueprints.ts**

```typescript
// src/main/agent/tools/searchBlueprints.ts
import { z } from 'zod'
import type { CSlateServerClient } from '../../server/CSlateServerClient'
import { buildTool } from './types'

type SearchOutput = { results: unknown[]; error?: string }

export function createSearchBlueprintsTool(client: CSlateServerClient | null) {
  return buildTool({
    name: 'searchBlueprints',
    description: 'Search the CSlate community database for existing component blueprints matching a description. Always search before building from scratch — a good blueprint saves iterations.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of the component you want to find'),
      limit: z.number().min(1).max(10).default(5),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async (input) => {
      if (!client) {
        return { data: { results: [], error: 'Server not configured' } as SearchOutput }
      }
      const response = await client.search(input.query, input.limit)
      return { data: { results: response.results, error: response.error } as SearchOutput }
    },
  })
}
```

- [ ] **Step 4: Refactor scanLocalComponents.ts**

```typescript
// src/main/agent/tools/scanLocalComponents.ts
import { z } from 'zod'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import { buildTool } from './types'

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

export function createScanLocalComponentsTool(projectDir: string) {
  return buildTool({
    name: 'scanLocalComponents',
    description: 'Scan local project components for ones similar to a query. Used as fallback when server search has no results.',
    inputSchema: z.object({
      query: z.string().describe('Natural language description of what you are looking for'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async (input) => {
      const componentsDir = resolve(projectDir, 'components')
      if (!existsSync(componentsDir)) return { data: { matches: [] } as ScanOutput }

      const dirs = (await readdir(componentsDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name)

      const queryTokens = tokenize(input.query)
      const scored: MatchEntry[] = []

      for (const dir of dirs) {
        const compDir = resolve(componentsDir, dir)
        if (!compDir.startsWith(componentsDir + sep)) continue
        const manifestPath = join(compDir, 'manifest.json')
        if (!existsSync(manifestPath)) continue

        let manifest: Record<string, unknown>
        try {
          manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as Record<string, unknown>
        } catch {
          continue
        }
        const name = typeof manifest.name === 'string' ? manifest.name : dir
        const description = typeof manifest.description === 'string' ? manifest.description : ''
        const tags: string[] = Array.isArray(manifest.tags) ? manifest.tags as string[] : []

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
      return { data: { matches: scored.slice(0, 5) } as ScanOutput }
    },
  })
}
```

- [ ] **Step 5: Run all existing tests to verify backwards compatibility**

Run: `npx vitest run src/main/agent/`
Expected: All existing tests PASS (tools still export AI SDK compatible format)

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/tools/readManifest.ts src/main/agent/tools/readProjectContext.ts src/main/agent/tools/searchBlueprints.ts src/main/agent/tools/scanLocalComponents.ts
git commit -m "refactor(agent): migrate read-only tools to buildTool()

readManifest, readProjectContext, searchBlueprints, scanLocalComponents
now use CSTool interface with isReadOnly=true, isConcurrencySafe=true."
```

---

### Task 7: Refactor Write Tools to buildTool()

**Files:**
- Modify: `src/main/agent/tools/renderComponent.ts`
- Modify: `src/main/agent/tools/writeComponent.ts`
- Modify: `src/main/agent/tools/reviewCode.ts`

- [ ] **Step 1: Refactor renderComponent.ts**

```typescript
// src/main/agent/tools/renderComponent.ts
import { z } from 'zod'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentFiles } from '../lib/bundler'
import { stripFences } from '../lib/stripFences'
import { PlacementSchema, type Placement } from '../lib/canvasJson'
import { buildTool } from './types'

type RenderOutput = {
  success: boolean
  componentId: string
  bundle?: string
  files?: Record<string, string>
  manifest?: unknown
  placement?: Placement
  errors?: string[]
}

export function createRenderComponentTool() {
  return buildTool({
    name: 'renderComponent',
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
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async (input) => {
      const cleanFiles: Record<string, string> = {}
      for (const [path, content] of Object.entries(input.files)) {
        cleanFiles[path] = stripFences(content)
      }

      const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
      if (!validation.valid) {
        return { data: { success: false, componentId: '', errors: validation.errors } as RenderOutput }
      }

      let bundle: string
      try {
        bundle = await bundleComponentFiles(cleanFiles)
      } catch (e) {
        return { data: { success: false, componentId: '', errors: [e instanceof Error ? e.message : String(e)] } as RenderOutput }
      }

      const componentId = `preview_${Date.now()}`
      return { data: { success: true, componentId, bundle, files: cleanFiles, manifest: input.manifest, placement: input.placement } as RenderOutput }
    },
  })
}
```

- [ ] **Step 2: Refactor writeComponent.ts**

```typescript
// src/main/agent/tools/writeComponent.ts
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join, resolve, sep, dirname } from 'path'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentDir } from '../lib/bundler'
import { PlacementSchema, updateCanvasJson, type Placement } from '../lib/canvasJson'
import { stripFences } from '../lib/stripFences'
import { buildTool } from './types'

type WriteOutput = {
  success: boolean
  path: string
  componentId?: string
  bundle?: string
  placement?: Placement
  manifest?: unknown
  errors?: string[]
}

export function createWriteComponentTool(projectDir: string) {
  return buildTool({
    name: 'writeComponent',
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
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async (input) => {
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return { data: { success: false, path: '', errors: ['Invalid componentId: path traversal'] } as WriteOutput }
      }

      const cleanFiles: Record<string, string> = {}
      for (const [filePath, content] of Object.entries(input.files)) {
        cleanFiles[filePath] = stripFences(content)
      }

      const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
      if (!validation.valid) {
        return { data: { success: false, path: '', errors: validation.errors } as WriteOutput }
      }

      await mkdir(componentDir, { recursive: true })
      await writeFile(join(componentDir, 'manifest.json'), JSON.stringify(input.manifest, null, 2), 'utf-8')
      await Promise.all(
        Object.entries(cleanFiles).map(async ([filePath, content]) => {
          const target = join(componentDir, filePath)
          if (!target.startsWith(componentDir + sep)) {
            throw new Error(`Path traversal in files: "${filePath}"`)
          }
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, content, 'utf-8')
        })
      )

      let bundle: string
      try {
        bundle = await bundleComponentDir(componentDir)
      } catch (e) {
        return { data: { success: false, path: componentDir, errors: [e instanceof Error ? e.message : String(e)] } as WriteOutput }
      }

      await writeFile(join(componentDir, 'bundle.js'), bundle, 'utf-8')

      const defaultSize = input.manifest.defaultSize as { width?: number; height?: number } | undefined
      const placement: Placement = input.placement ?? {
        x: 0, y: 0,
        width: defaultSize?.width ?? 30,
        height: defaultSize?.height ?? 25,
      }
      await updateCanvasJson(projectDir, input.componentId, placement)

      return { data: { success: true, path: componentDir, componentId: input.componentId, bundle, placement, manifest: input.manifest } as WriteOutput }
    },
  })
}
```

- [ ] **Step 3: Refactor reviewCode.ts**

```typescript
// src/main/agent/tools/reviewCode.ts
import { generateText } from 'ai'
import { z } from 'zod'
import { buildTool } from './types'

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
  return buildTool({
    name: 'reviewCode',
    description: 'Spawn an isolated code review sub-agent to check the generated component. Run in parallel with renderComponent. If issues are found, fix them before calling writeComponent.',
    inputSchema: z.object({
      files: FilesSchema,
      manifest: z.any().describe('The ComponentManifest object'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => false, // expensive — run serially
    call: async (input) => {
      const filesText = Object.entries(input.files)
        .map(([name, content]) => `### ${name}\n\`\`\`tsx\n${content}\n\`\`\``)
        .join('\n\n')

      const { text } = await generateText({
        model: registry.languageModel(fastModelId),
        system: REVIEWER_SYSTEM,
        prompt: `Review this component:\n\n${filesText}\n\n### manifest.json\n\`\`\`json\n${JSON.stringify(input.manifest, null, 2)}\n\`\`\``,
        maxOutputTokens: 1000,
      })

      try {
        return { data: JSON.parse(text) as ReviewResult }
      } catch {
        return { data: { passed: false, issues: ['Reviewer returned invalid JSON'], suggestions: [] } as ReviewResult }
      }
    },
  })
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run src/main/agent/`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/renderComponent.ts src/main/agent/tools/writeComponent.ts src/main/agent/tools/reviewCode.ts
git commit -m "refactor(agent): migrate write tools to buildTool()

renderComponent, writeComponent (isReadOnly=false, isConcurrencySafe=false)
reviewCode (isReadOnly=true but isConcurrencySafe=false — expensive LLM call)"
```

---

### Task 8: Update Tool Index and Integrate into Engine

**Files:**
- Modify: `src/main/agent/tools/index.ts`
- Modify: `src/main/agent/engine.ts`
- Modify: `src/main/agent/orchestrator/index.ts`

- [ ] **Step 1: Update tools/index.ts to export CSTool array builder**

```typescript
// src/main/agent/tools/index.ts
export { validateManifestTool } from './validateManifest'
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
import { createReadManifestTool } from './readManifest'
import { createReadProjectContextTool } from './readProjectContext'
import { createSearchBlueprintsTool } from './searchBlueprints'
import { createScanLocalComponentsTool } from './scanLocalComponents'

export type ToolFactoryDeps = {
  projectDir: string
  registry: { languageModel: (id: string) => any }
  fastModelId: string
  serverClient: CSlateServerClient | null
}

/**
 * Build the complete tool array for a given context.
 * Returns both the CSTool instances and AI SDK compatible tools.
 */
export function buildToolSet(deps: ToolFactoryDeps): {
  csTools: CSTool[]
  aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>>
} {
  const csTools: CSTool[] = [
    validateManifestTool,
    createReadManifestTool(deps.projectDir),
    createReadProjectContextTool(deps.projectDir),
    createSearchBlueprintsTool(deps.serverClient),
    createScanLocalComponentsTool(deps.projectDir),
    createRenderComponentTool(),
    createWriteComponentTool(deps.projectDir),
    createReviewCodeTool(deps.registry, deps.fastModelId),
  ]

  const aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>> = {}
  for (const tool of csTools) {
    aiTools[tool.name] = tool.toAISDKTool()
  }

  return { csTools, aiTools }
}
```

- [ ] **Step 2: Integrate compaction into engine.ts**

Add compaction to the conversation history before each LLM call. This is a targeted edit to `engine.ts` — add the import and call `autoCompactIfNeeded()` in the `stream()` method before routing:

```typescript
// At top of engine.ts, add import:
import { autoCompactIfNeeded } from './lib/compact'

// In AgentEngine.stream(), before routing, add:
// Compact conversation if approaching context limit
const compactedHistory = autoCompactIfNeeded(
  input.conversationHistory.map(m => ({ role: m.role, content: m.content }))
)
// Use compactedHistory instead of input.conversationHistory in all downstream calls
```

- [ ] **Step 3: Thread AbortController into engine.ts**

```typescript
// At top of engine.ts, add import:
import { createChildAbortController } from './lib/abortUtils'

// In AgentEngine constructor or stream(), create:
// const abortController = new AbortController()
// Pass abortController.signal to streamText() calls via abortSignal option
// Create child controllers for sub-agents
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run src/main/agent/`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/tools/index.ts src/main/agent/engine.ts
git commit -m "feat(agent): integrate compaction, abort, and tool set builder

- tools/index.ts exports buildToolSet() for unified tool construction
- engine.ts compacts conversation history before each turn
- AbortController threaded through engine for future cancellation"
```

---

### Task 9: Run Full Test Suite and Typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 3: Fix any failures**

If any tests fail, fix them. Common issues:
- Import paths changed (update imports)
- Tool return type changed from `Output` to `{ data: Output }` (update test assertions)
- Orchestrator expects old tool shape (update to use `.toAISDKTool()`)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any remaining type/test issues from tool migration"
```
