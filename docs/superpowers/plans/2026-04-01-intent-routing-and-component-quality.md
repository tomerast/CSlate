# Intent Routing + Component Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two root causes behind "slope scanner v2 stuck on Scanning Slopes": (1) the intent router misclassifies symptom-descriptions as `direct` responses instead of fix requests, and (2) the sub-agent build system prompt lets components initialize loading state in a way that locks up when `bridge` is absent.

**Architecture:**
Task 1 feeds conversation history and the active component list into `classifyIntent` so the router has enough context to recognize "it is stuck" as an `orchestrator` fix request rather than a general question. Task 2 adds explicit bridge-safe loading rules to `PLATFORM_KNOWLEDGE` and corrects a conflicting guideline in `BEHAVIORAL_GUIDELINES` that discouraged necessary loading fallbacks.

**Tech Stack:** TypeScript, Vitest, `ai` SDK (`generateObject`), pino logger

---

## File Map

| File | Change |
|------|--------|
| `src/main/agent/router.ts` | Add `history` + `activeComponentIds` params; build contextual prompt; expand ROUTER_SYSTEM with symptom-routing rule |
| `src/main/agent/engine.ts` | Load `memory` + `activeComponents` before routing (parallel); pass history + component IDs to `classifyIntent` |
| `src/main/agent/__tests__/router.test.ts` | Update existing tests to new signature; add symptom-routing and context-in-prompt tests |
| `src/main/agent/prompts/fragments.ts` | Add `### Bridge-Safe Loading Patterns` section to `PLATFORM_KNOWLEDGE`; fix `BEHAVIORAL_GUIDELINES` loading-state exception |

---

## Task 1: Context-Aware Intent Routing

### Files:
- Modify: `src/main/agent/router.ts`
- Modify: `src/main/agent/engine.ts`
- Modify: `src/main/agent/__tests__/router.test.ts`

---

- [ ] **Step 1.1: Write failing tests for new signature and context propagation**

In `src/main/agent/__tests__/router.test.ts`, add to the existing `describe('classifyIntent')` block:

```typescript
it('routes symptom description to orchestrator when active components exist', async () => {
  vi.mocked(generateObject).mockResolvedValue({
    object: {
      route: 'orchestrator',
      skill: null,
      summary: 'fix stuck loading state in snow_tracker_v2',
      targetComponentId: 'snow_tracker_v2',
    },
  } as any)

  const result = await classifyIntent(
    'it is stuck on scanning slopes',
    [
      { role: 'user', content: 'create a snow tracking app for skiers' },
      { role: 'assistant', content: 'Building snow_tracker_v2...' },
    ],
    ['snow_tracker_v2'],
    { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
    mockRegistry as any
  )

  expect(result.route).toBe('orchestrator')
  expect(result.targetComponentId).toBe('snow_tracker_v2')
})

it('includes active component IDs in the prompt sent to LLM', async () => {
  vi.mocked(generateObject).mockResolvedValue({
    object: { route: 'orchestrator', skill: null, summary: 'fix', targetComponentId: 'snow_tracker_v2' },
  } as any)

  await classifyIntent(
    'it is stuck',
    [{ role: 'user', content: 'make a snow tracker' }],
    ['snow_tracker_v2'],
    { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
    mockRegistry as any
  )

  const call = vi.mocked(generateObject).mock.calls[0][0] as any
  expect(call.prompt).toContain('snow_tracker_v2')
})

it('includes recent conversation history in the prompt sent to LLM', async () => {
  vi.mocked(generateObject).mockResolvedValue({
    object: { route: 'orchestrator', skill: null, summary: 'fix', targetComponentId: null },
  } as any)

  await classifyIntent(
    'it is stuck',
    [{ role: 'user', content: 'create a snow tracking app for skiers' }],
    ['snow_tracker_v2'],
    { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
    mockRegistry as any
  )

  const call = vi.mocked(generateObject).mock.calls[0][0] as any
  expect(call.prompt).toContain('create a snow tracking app for skiers')
})

it('works with empty history and no active components', async () => {
  vi.mocked(generateObject).mockResolvedValue({
    object: { route: 'direct', skill: null, summary: 'asking about settings', targetComponentId: null },
  } as any)

  const result = await classifyIntent(
    'How do I change my API key?',
    [],
    [],
    { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
    mockRegistry as any
  )

  expect(result.route).toBe('direct')
})
```

Also update the **four existing tests** to pass the two new arguments (`[]` for history, `[]` for activeComponentIds) in the correct position before `config`:

```typescript
// Example — apply this pattern to all four existing tests:
const result = await classifyIntent(
  'Build me a kanban board',
  [],          // ← add empty history
  [],          // ← add empty activeComponentIds
  { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
  mockRegistry as any
)
```

- [ ] **Step 1.2: Run tests to confirm they fail with the right error**

```bash
npx vitest run src/main/agent/__tests__/router.test.ts
```

Expected: all new tests fail with `Expected number of arguments: 3, got 5` or similar type error. Existing tests fail with argument count mismatch. None should pass yet.

- [ ] **Step 1.3: Update `classifyIntent` signature and build contextual prompt**

Replace the contents of `src/main/agent/router.ts` with:

```typescript
import { generateObject } from 'ai'
import { z } from 'zod'
import type { LLMConfig } from './providers'
import { fastModelId } from './providers'
import { engineLog } from '../lib/logger'

const RouteSchema = z.object({
  route: z.enum(['orchestrator', 'skill', 'direct']),
  skill: z.enum(['state-wirer', 'component-search']).nullable(),
  summary: z.string(),
  targetComponentId: z.string().nullable(),
})

export type RouteResult = z.infer<typeof RouteSchema>

const ROUTER_SYSTEM = `You are the CSlate router. Classify the user's message into one of three routes:

- orchestrator: Any component work — building, modifying, styling, fixing, iterating on components. This includes explicit keywords ("build", "create", "add", "make", "update", "modify", "change", "fix", "restyle", "make it prettier", "I don't like") AND implicit feedback ("feedback on current result"). ALSO includes symptom descriptions when active components are listed — phrases like "it's stuck", "nothing loads", "the spinner won't stop", "it's not working", "nothing is showing", "it crashed", "I see an error", "why isn't it", "can you fix" — these are bug reports, not questions.
- skill: Cross-component operations that don't build/modify a single component:
  - state-wirer: "connect", "wire", "link", "when X updates Y", "share data between"
  - component-search: "find", "search", "show me components", "browse", "what components exist"
- direct: General questions, settings help, non-component tasks. Only use this when no active components are relevant and the message is clearly not about a component.

targetComponentId: the snake_case ID of an existing component being referenced. Null if creating new or not applicable.
summary: one sentence describing what to do.`

function buildContextualPrompt(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeComponentIds: string[]
): string {
  const parts: string[] = []

  if (activeComponentIds.length > 0) {
    parts.push(`Active components on canvas: ${activeComponentIds.join(', ')}`)
  }

  if (history.length > 0) {
    const recent = history.slice(-2)
    const historyLines = recent.map((m) => `${m.role}: ${m.content}`).join('\n')
    parts.push(`Recent conversation:\n${historyLines}`)
  }

  if (parts.length === 0) return message

  return `${parts.join('\n\n')}\n\nCurrent message: ${message}`
}

export async function classifyIntent(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  activeComponentIds: string[],
  config: LLMConfig,
  registry: { languageModel: (id: string) => any }
): Promise<RouteResult> {
  const modelId = fastModelId(config)
  const log = engineLog.child({ component: 'router' })
  log.debug({ modelId, message }, 'classifyIntent start')
  const t0 = Date.now()

  try {
    const { object } = await generateObject({
      model: registry.languageModel(modelId),
      system: ROUTER_SYSTEM,
      prompt: buildContextualPrompt(message, history, activeComponentIds),
      schema: RouteSchema,
    })
    log.debug({ modelId, durationMs: Date.now() - t0, route: object.route }, 'classifyIntent done')
    return object
  } catch (err) {
    log.warn({ modelId, err }, 'classifyIntent failed, defaulting to orchestrator')
    return { route: 'orchestrator', skill: null, summary: message, targetComponentId: null }
  }
}
```

- [ ] **Step 1.4: Run tests — router tests should pass now**

```bash
npx vitest run src/main/agent/__tests__/router.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 1.5: Update `engine.ts` to pass context to `classifyIntent`**

In `src/main/agent/engine.ts`, replace the `stream` method body up through the dispatch block:

```typescript
async *stream(input: RunInput): AsyncGenerator<unknown> {
  const log = engineLog.child({ tabId: this.options.tabId })
  const reg = this.registry as { languageModel: (id: string) => any }

  // Load context upfront — needed for routing and execution
  const [memory, activeComponents] = await Promise.all([
    readMemory(this.projectDir),
    this.loadActiveComponents(),
  ])

  // Route intent with full context
  log.debug({ message: input.message }, 'routing intent')
  const route = await classifyIntent(
    input.message,
    input.conversationHistory,
    activeComponents.map((c) => c.componentId),
    this.config,
    reg
  )
  log.info({ route: route.route, skill: route.skill, summary: route.summary }, 'intent routed')

  // Dispatch based on route
  if (route.route === 'orchestrator') {
    yield* this.runOrchestrator(input, route, memory, activeComponents, reg, log)
  } else if (route.route === 'skill' && route.skill) {
    yield* this.runSkill(route.skill, input, memory, activeComponents, log)
  } else {
    yield* this.runDirect(input, memory, log)
  }
}
```

- [ ] **Step 1.6: Run engine tests to confirm nothing broke**

```bash
npx vitest run src/main/agent/__tests__/engine.test.ts
```

Expected: all existing engine tests pass.

- [ ] **Step 1.7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Fix any TypeScript errors (the new `classifyIntent` signature may surface in other test files).

- [ ] **Step 1.8: Commit**

```bash
git add src/main/agent/router.ts src/main/agent/engine.ts src/main/agent/__tests__/router.test.ts
git commit -m "feat(router): pass conversation history and active components to intent classifier

Symptom messages like 'it is stuck' now route to orchestrator when
components are on the canvas, instead of being treated as direct questions."
```

---

## Task 2: Bridge-Safe Loading Patterns in Build Prompts

### Files:
- Modify: `src/main/agent/prompts/fragments.ts`

---

- [ ] **Step 2.1: Write a test that asserts the bridge loading guidance exists**

In `src/main/agent/__tests__/sub-agent.test.ts`, add (or create the file if it doesn't have content yet):

```typescript
import { describe, it, expect } from 'vitest'
import { PLATFORM_KNOWLEDGE } from '../prompts/fragments'
import { buildSubAgentPrompt } from '../orchestrator/sub-agent'

describe('PLATFORM_KNOWLEDGE', () => {
  it('contains bridge-safe loading guidance', () => {
    expect(PLATFORM_KNOWLEDGE).toContain('seed data')
    expect(PLATFORM_KNOWLEDGE).toContain('bridge') // bridge loading section exists
  })

  it('warns against loading initialized to true with bridge guard', () => {
    expect(PLATFORM_KNOWLEDGE).toContain('useState(false)')
  })
})

describe('buildSubAgentPrompt', () => {
  it('includes platform knowledge with bridge loading guidance', () => {
    const prompt = buildSubAgentPrompt({
      task: { file: 'ui.tsx', assignment: 'Build the main UI', blueprint: null },
      contract: 'interface Props {}',
    })
    // BUILD_SYSTEM (which includes PLATFORM_KNOWLEDGE) is injected as the system prompt,
    // not the user prompt — so we test PLATFORM_KNOWLEDGE directly above
    expect(prompt).toContain('ui.tsx')
    expect(prompt).toContain('interface Props {}')
  })
})
```

- [ ] **Step 2.2: Run test to confirm it fails**

```bash
npx vitest run src/main/agent/__tests__/sub-agent.test.ts
```

Expected: the `PLATFORM_KNOWLEDGE` assertions fail — "seed data" and `useState(false)` are not present yet.

- [ ] **Step 2.3: Add bridge-safe loading section to `PLATFORM_KNOWLEDGE`**

In `src/main/agent/prompts/fragments.ts`, add the following section after the existing `### Bridge API` section (after the closing triple-backtick of the bridge code block, before `### Zustand State Store`):

```typescript
### Bridge-Safe Loading Patterns (CRITICAL — violating this causes infinite loading)

Components must render correctly when \`bridge\` is \`undefined\` — bridge is not always provided.

**RULE: Never initialize loading state to \`true\` before a bridge fetch. Initialize state with seed/mock data instead.**

\`\`\`tsx
// WRONG — freezes the component when bridge is absent:
const [data, setData] = useState([])
const [loading, setLoading] = useState(true)  // ← true on init
useEffect(() => {
  if (!bridge) return  // ← exits without calling setLoading(false) → infinite spinner
  bridge.fetch('src', 'endpoint', {}).then(d => { setData(d); setLoading(false) })
}, [bridge])

// CORRECT — renders immediately with seed data, replaces when bridge is available:
const SEED_DATA = [{ id: 1, name: 'Example', value: 42 }]
const [data, setData] = useState(SEED_DATA)  // ← visible immediately
useEffect(() => {
  if (!bridge) return  // ← safe: seed data already shown
  bridge.fetch('src', 'endpoint', {}).then(d => { setData(d) })
}, [bridge])
\`\`\`

Seed data should be realistic enough to demonstrate the UI layout. One or two representative items is enough.
```

- [ ] **Step 2.4: Fix the conflicting BEHAVIORAL_GUIDELINES loading-state rule**

In `src/main/agent/prompts/fragments.ts`, in `BEHAVIORAL_GUIDELINES`, find this line:

```
- Do not add error boundaries, loading states, or fallbacks the user did not ask for
```

Replace it with:

```
- Do not add error boundaries, loading states, or fallbacks the user did not ask for — EXCEPTION: when using bridge.fetch() for data, always initialize state with seed/mock data (never with an empty array + loading=true) so the component renders without bridge
```

- [ ] **Step 2.5: Run tests to confirm they pass**

```bash
npx vitest run src/main/agent/__tests__/sub-agent.test.ts
```

Expected: all tests pass including the new PLATFORM_KNOWLEDGE assertions.

- [ ] **Step 2.6: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add src/main/agent/prompts/fragments.ts src/main/agent/__tests__/sub-agent.test.ts
git commit -m "feat(prompts): add bridge-safe loading pattern guidance to PLATFORM_KNOWLEDGE

Prevents sub-agents from generating components that initialize loading=true
before a bridge fetch, causing infinite spinners when bridge is not provided.
Adds seed data pattern with correct/wrong examples."
```

---

## Self-Review

**Spec coverage:**
- [x] Intent router misclassifies symptom messages → Task 1 adds history + active component context, expands ROUTER_SYSTEM
- [x] Router only sees current message, not canvas state → Task 1 passes `activeComponentIds` + last 2 history turns
- [x] Components lock up when bridge is absent → Task 2 adds explicit seed-data pattern + fixes conflicting guideline
- [x] `BEHAVIORAL_GUIDELINES` discourages loading fallbacks (conflicting with bridge pattern) → Task 2 step 2.4 adds the exception

**Placeholder scan:** None found — all steps have actual code.

**Type consistency:**
- `classifyIntent` signature updated in both `router.ts` and all call sites (`engine.ts`, tests)
- `buildContextualPrompt` is a private helper in `router.ts` only, not exported
- No new exported types introduced

**Not in scope (follow-up work):**
- Injecting a real `bridge` prop into `DynamicComponent` — requires the full bridge API implementation
- Source-level static analysis of component bundles — the prompt fix prevents the bug at generation time; static analysis can be added later if needed
