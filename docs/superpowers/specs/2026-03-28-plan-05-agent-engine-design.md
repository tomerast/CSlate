# Plan 05: AI Agent Engine — Design Specification

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Full agent engine — skill system, memory, sub-agents, streaming, tool layer

---

## 1. Goal

Build the CSlate agent engine: the layer between a raw LLM call and the full
orchestrator described in decision 007. After this plan:

- The agent can take a user message and produce a rendered component end-to-end
- Skills route specialized context + tools to the right task (build, modify, wire, search)
- Memory loads project context and user preferences per session
- Sub-agents run code review + manifest validation in parallel with generation
- Every token streams back to the renderer via Electron IPC
- Any LLM provider (Anthropic, OpenAI, Google, local) works via one config swap

---

## 2. Framework Decision: Vercel AI SDK + Custom Skill Router

**Why not LangGraph.js:**
LangGraph requires `@langchain/core` + per-provider adapter packages, has brutal
TypeScript generics at composition time, and is a Python-first port. The graph
orchestration model is the "full orchestrator" we are deferring. It adds framework
complexity that buys nothing at this stage.

**Why Vercel AI SDK (`ai` package):**
- Multi-provider solved cleanly: one `model=` swap, provider registry pattern
- `generateText` + `stopWhen` + `prepareStep` handles multi-step tool loops
- `fullStream` async iterator pipes directly to Electron IPC — no transport adapter
- Sub-agents via tool `execute()` calling nested `generateText` — documented pattern
- `prepareStep` swaps `system` + `tools` per step = skill switching mid-loop
- TypeScript-excellent, lightweight, no mandatory state store

**Custom skill router (~300 lines):**
The framework handles LLM calls. We own the orchestration layer. Skills are plain
config objects. The router selects the right skill, loads memory, fires the loop.

---

## 3. Architecture

```
Renderer (React)
  │  Cmd+K / chat message
  ▼
IPC: agent:run { message, projectDir, tabId }
  │
  ▼
AgentEngine (src/main/agent/engine.ts)
  │
  ├── 1. parseIntent()         → structured intent (LLM call, generateObject)
  ├── 2. selectSkill()         → picks skill config from registry
  ├── 3. loadContext()         → reads memory files + active manifest list
  ├── 4. streamText()          → Vercel AI SDK agent loop
  │      ├── tools execute in parallel (Promise.all per step)
  │      ├── sub-agents fire inside tool execute() for gen+review
  │      └── fullStream → IPC: agent:token, agent:tool-call, agent:step-done
  └── 5. onFinish()            → write memory, checkpoint component, emit agent:done

IPC response stream:
  agent:token        { delta: string }
  agent:tool-call    { tool: string, input: object }
  agent:tool-result  { tool: string, result: object }
  agent:step-done    { step: number }
  agent:done         { componentId?: string, usage: object }
  agent:error        { message: string }
```

---

## 4. Directory Structure

```
src/main/agent/
├── engine.ts              AgentEngine class — orchestrates the full flow
├── skills/
│   ├── index.ts           skill registry (name → SkillConfig)
│   ├── component-builder.ts
│   ├── component-modifier.ts
│   ├── manifest-generator.ts
│   ├── component-search.ts
│   ├── state-wirer.ts
│   ├── feedback-iterator.ts
│   └── style-applier.ts
├── tools/
│   ├── index.ts           exports all tools
│   ├── renderComponent.ts
│   ├── readManifest.ts
│   ├── writeComponent.ts
│   ├── searchBlueprints.ts
│   ├── readProjectContext.ts
│   ├── validateManifest.ts
│   └── reviewCode.ts      (sub-agent tool)
├── memory/
│   ├── index.ts           read/write memory files
│   └── context-builder.ts builds the context string injected into system prompt
├── providers.ts           Vercel AI SDK provider registry
├── intent.ts              parseIntent() — structured output LLM call
└── ipc.ts                 IPC handler registration (agent:run)
```

---

## 5. Skill System

### 5.1 SkillConfig Interface

```typescript
interface SkillConfig {
  name: string
  description: string                    // used by intent router to select skill
  systemPrompt: (ctx: AgentContext) => string  // injected context + instructions
  tools: Tool[]                          // subset of all tools
  stopWhen?: StopCondition              // defaults to stepCountIs(15)
  maxTokens?: number
  temperature?: number
  model?: LanguageModel                  // override for this skill (e.g. fast model for search)
}
```

### 5.2 Skill Registry

| Skill | Trigger Intent | Tools | Purpose |
|---|---|---|---|
| `component-builder` | new component request | renderComponent, writeComponent, searchBlueprints, validateManifest, reviewCode | Generate full component package from natural language |
| `component-modifier` | modify/update existing component | renderComponent, writeComponent, readManifest, validateManifest | Modify component preserving manifest compatibility |
| `manifest-generator` | fix manifest, add inputs/outputs | readManifest, writeComponent, validateManifest | Create or fix component manifest |
| `component-search` | find existing, browse community | searchBlueprints, readProjectContext | Search server DB for matching blueprints |
| `state-wirer` | connect components, wire state | readManifest, writeComponent | Connect components via Zustand keys + event bus |
| `feedback-iterator` | iterate, change, make it..., I don't like | renderComponent, writeComponent, readManifest | Refine an existing component from feedback |
| `style-applier` | restyle, theme, colors, dark mode | renderComponent, writeComponent | Apply Tailwind + design token styling changes |

### 5.3 Intent Parsing

A fast, cheap structured output call before the main agent loop:

```typescript
const IntentSchema = z.object({
  skill: z.enum(['component-builder', 'component-modifier', 'manifest-generator',
                 'component-search', 'state-wirer', 'feedback-iterator', 'style-applier']),
  targetComponentId: z.string().optional(),   // existing component being modified
  summary: z.string(),                         // one-line description of what user wants
  isMultiTurn: z.boolean(),                    // needs back-and-forth?
})
```

Uses a fast/cheap model override (e.g. `haiku` or `gpt-4o-mini`) — this call is
invisible to the user and must be <500ms.

### 5.4 System Prompt Construction

Each skill's `systemPrompt` is a function that receives `AgentContext` and returns
the full system prompt string. It combines:

1. **Core CSlate identity** (fixed, never overrideable)
2. **Skill-specific instructions** (what to do, how to do it, output format)
3. **Platform knowledge** (manifest format, sandbox rules, Zustand patterns, Tailwind tokens)
4. **Project memory** (what this app is about, user preferences, component history)
5. **Active canvas state** (what components exist, their manifests, their placements)

The `component-builder` skill system prompt is the most critical — it embeds:
- Full `ComponentManifest` TypeScript interface
- The multi-file package structure (`ui.tsx`, `logic.ts`, `types.ts`, `context.md`, `manifest.json`)
- Sandbox constraints (no `fetch`, no `localStorage`, use `bridge.*` for data)
- Zustand store patterns (instance-prefixed keys, `stateKey` binding)
- Event bus patterns (emit/listen via typed events)
- Tailwind + design token rules (use `bg-primary` not `bg-blue-500`)
- Grid system (8px base unit, `defaultSize` in grid units)
- 3-5 example component packages as few-shot examples

---

## 6. Tool Layer

### 6.1 Tool Definitions

```typescript
// renderComponent — loads generated files into sandbox iframe
renderComponent = tool({
  description: 'Render a component package in the sandbox iframe on the Slate canvas',
  parameters: z.object({
    files: z.object({
      'ui.tsx': z.string(),
      'logic.ts': z.string().optional(),
      'types.ts': z.string().optional(),
    }),
    manifest: ComponentManifestSchema,
    placement: z.object({ x: z.number(), y: z.number(),
                           width: z.number(), height: z.number() }).optional(),
  }),
  execute: async ({ files, manifest, placement }) => {
    // IPC to renderer: load component into sandbox
    // Returns: { success, componentId, screenshotData? }
  }
})

// writeComponent — persists component package to disk
writeComponent = tool({
  description: 'Save a component package to the project directory',
  parameters: z.object({
    componentId: z.string(),
    files: ComponentFilesSchema,
    manifest: ComponentManifestSchema,
    contextMd: z.string(),    // AI-generated build summary
  }),
  execute: async (pkg) => {
    // IPC: component:write
    // Triggers checkpoint
    // Returns: { path, checkpointId }
  }
})

// searchBlueprints — query CSlate Server for matching components
searchBlueprints = tool({
  description: 'Search the CSlate community database for components matching a description',
  parameters: z.object({
    query: z.string(),
    limit: z.number().default(5),
  }),
  execute: async ({ query, limit }) => {
    // HTTP GET /api/components/search
    // Returns: ComponentManifest[] with source snippets
  }
})

// readManifest — read a component's manifest from disk
readManifest = tool({
  description: 'Read the manifest.json for a component already on the canvas',
  parameters: z.object({ componentId: z.string() }),
  execute: async ({ componentId }) => {
    // IPC: component:read, return manifest
  }
})

// validateManifest — validate manifest against @cslate/shared Zod schema
validateManifest = tool({
  description: 'Validate a component manifest against the CSlate schema',
  parameters: z.object({ manifest: z.unknown() }),
  execute: async ({ manifest }) => {
    // Import ComponentManifestSchema from @cslate/shared
    // Return { valid, errors }
  }
})

// readProjectContext — read project manifest + all component manifests
readProjectContext = tool({
  description: 'Read the current project context: app name, all components and their manifests',
  parameters: z.object({ includeSourceSummaries: z.boolean().default(false) }),
  execute: async ({ includeSourceSummaries }) => {
    // IPC: project:open + component:list
    // Returns structured project context
  }
})

// reviewCode — sub-agent tool: spawns a separate LLM call to review generated code
reviewCode = tool({
  description: 'Spawn a code review sub-agent to check generated component code for correctness, security, and CSlate compliance',
  parameters: z.object({
    files: ComponentFilesSchema,
    manifest: ComponentManifestSchema,
  }),
  execute: async ({ files, manifest }) => {
    // Sub-agent: separate generateText call with reviewer system prompt
    // Isolated context — reviewer doesn't see generation conversation
    // Returns { passed, issues: string[], suggestions: string[] }
  }
})
```

### 6.2 Sub-Agent: Code Review

`reviewCode` spawns a focused `generateText` with:
- A dedicated reviewer system prompt (separate from the builder)
- No conversation history from the parent (isolated context = no bias)
- Checks: sandbox compliance, manifest accuracy, Tailwind token usage, Zustand patterns, TypeScript validity, security (no `eval`, no `dangerouslySetInnerHTML` with user input)
- Fast model override — haiku/gpt-4o-mini is sufficient for review
- Returns structured verdict: `{ passed, issues, suggestions }`

The parent agent calls `renderComponent` and `reviewCode` in the same step — they
run in parallel. If review finds issues, the parent sees them and self-corrects
before writing to disk.

---

## 7. Memory System

### 7.1 File Structure

```
<projectDir>/agent/memory/
├── MEMORY.md              index
├── user_preferences.md    design taste, color schemes, preferred patterns
├── project_context.md     what the app is about, domain, target audience
├── component_history.md   components built, iteration count, final description
└── feedback_patterns.md   recurring refinement requests ("always wants rounded corners")
```

### 7.2 Context Builder

`context-builder.ts` reads all memory files and assembles a compact context
string (target: <800 tokens) injected into the skill system prompt:

```
## Project Memory
App: TaskFlow — a personal productivity app for developers
Domain: task management, GTD methodology
Theme preference: minimal, monochrome, high contrast
Common feedback: user always asks for larger font sizes

## Component History (last 5)
- todo-list: 3 iterations, accepted. User liked the checkbox animations.
- timer-widget: 1 iteration. Fast build, no feedback.
- kanban-board: in progress.
```

### 7.3 Memory Writes

On `agent:done`:
- Append to `component_history.md` (componentId, iterations, AI-generated summary)
- Update `feedback_patterns.md` if the session had ≥2 feedback iterations
- Update `user_preferences.md` if style preferences were expressed

Memory writes are fire-and-forget (async, non-blocking to the main agent loop).

---

## 8. Streaming to Renderer

```typescript
// src/main/agent/ipc.ts
ipcMain.handle('agent:run', async (event, { message, projectDir, tabId }) => {
  const stream = engine.stream({ message, projectDir, tabId })

  for await (const part of stream) {
    switch (part.type) {
      case 'text-delta':
        event.sender.send('agent:token', { delta: part.textDelta })
        break
      case 'tool-call':
        event.sender.send('agent:tool-call', { tool: part.toolName, input: part.input })
        break
      case 'tool-result':
        event.sender.send('agent:tool-result', { tool: part.toolName, result: part.result })
        break
      case 'finish':
        event.sender.send('agent:done', { usage: part.usage })
        break
      case 'error':
        event.sender.send('agent:error', { message: part.error.message })
        break
    }
  }
})
```

The renderer's chat panel subscribes to these events and:
- Appends `agent:token` deltas to the chat bubble in real-time
- Shows tool call activity (e.g. "Searching community blueprints…")
- Triggers sandbox iframe reload on `renderComponent` tool result
- Shows usage/cost on `agent:done`

---

## 9. Provider Configuration

```typescript
// src/main/agent/providers.ts
import { createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { createOllama } from 'ollama-ai-provider'

export function buildRegistry(config: LLMConfig) {
  return createProviderRegistry({
    anthropic: anthropic({ apiKey: config.apiKey }),  // if provider === 'anthropic'
    openai: openai({ apiKey: config.apiKey }),
    google: google({ apiKey: config.apiKey }),
    local: createOllama({ baseURL: config.baseUrl }),
  })
}

// Model references: "anthropic:claude-sonnet-4-6", "openai:gpt-4o", "local:llama3"
// Intent parsing: fast model (haiku / gpt-4o-mini)
// Code generation: powerful model (sonnet / gpt-4o)
// Review: fast model (haiku / gpt-4o-mini)
```

---

## 10. AgentEngine Class

```typescript
// src/main/agent/engine.ts
class AgentEngine {
  constructor(private config: LLMConfig, private projectDir: string) {}

  async *stream({ message, tabId }: RunInput): AsyncIterable<AgentStreamPart> {
    // 1. Parse intent (fast model, generateObject)
    const intent = await this.parseIntent(message)

    // 2. Select skill
    const skill = skillRegistry[intent.skill]

    // 3. Load context
    const ctx = await this.loadContext({ tabId, targetComponent: intent.targetComponentId })

    // 4. Build model
    const model = this.registry.languageModel(
      skill.model ?? `${this.config.provider}:${this.config.model}`
    )

    // 5. Stream
    const result = streamText({
      model,
      system: skill.systemPrompt(ctx),
      messages: ctx.conversationHistory,
      tools: Object.fromEntries(skill.tools.map(t => [t.name, t])),
      stopWhen: skill.stopWhen ?? stepCountIs(15),
      maxTokens: skill.maxTokens,
      temperature: skill.temperature,
      onStepFinish: ({ stepNumber, toolCalls, toolResults }) => {
        // update conversation history
      },
    })

    // 6. Yield stream parts
    for await (const part of result.fullStream) {
      yield part
    }

    // 7. Post-process
    const final = await result
    await this.writeMemory(intent, final, ctx)
  }
}
```

---

## 11. New-Component Flow (End-to-End)

```
1. User: "Add a live stock ticker for AAPL"

2. parseIntent() → { skill: 'component-builder', summary: 'stock ticker showing AAPL price' }

3. loadContext() → project memory + 3 existing component manifests + canvas state

4. streamText() begins — component-builder system prompt:
   - Full manifest format reference
   - Platform rules (sandbox, bridge, Zustand)
   - Memory: "user prefers minimal styling"
   - Available tools: renderComponent, searchBlueprints, writeComponent, validateManifest, reviewCode

5. Step 1: Model calls searchBlueprints({ query: "stock ticker real-time price" })
   → Returns: StockWidget v2 blueprint from community DB

6. Step 2: Model generates modified component based on blueprint
   → Calls renderComponent() + reviewCode() in parallel
   → Sandbox renders live ticker
   → Review returns { passed: true, issues: [] }

7. Step 3: Model calls writeComponent() — saves package to disk, triggers checkpoint

8. Stream ends → agent:done emitted → chat panel shows "AAPL ticker added to canvas"

Total steps: 3. Typical latency: 4–8s depending on model.
```

---

## 12. IPC Channels (New)

Added to `src/preload/channels.ts`:

| Channel | Direction | Payload |
|---|---|---|
| `agent:run` | invoke (renderer→main) | `{ message, projectDir, tabId }` |
| `agent:token` | on (main→renderer) | `{ delta: string }` |
| `agent:tool-call` | on (main→renderer) | `{ tool: string, input: object }` |
| `agent:tool-result` | on (main→renderer) | `{ tool: string, result: object }` |
| `agent:done` | on (main→renderer) | `{ componentId?, usage }` |
| `agent:error` | on (main→renderer) | `{ message: string }` |

---

## 13. Dependencies

| Package | Purpose |
|---|---|
| `ai` | Vercel AI SDK core (generateText, streamText, generateObject, tool) |
| `@ai-sdk/anthropic` | Anthropic provider |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/google` | Google provider |
| `ollama-ai-provider` | Local Ollama provider |
| `zod` | Already installed — tool schemas + intent schema |
| `@cslate/shared` | Already installed — ComponentManifest validation in tools |

---

## 14. Testing

- `intent.test.ts` — parseIntent returns correct skill for 10 representative messages
- `component-builder.test.ts` — skill system prompt contains all required sections (manifest format, sandbox rules, etc.)
- `tools/renderComponent.test.ts` — mock IPC, verify correct message sent to renderer
- `tools/reviewCode.test.ts` — mock generateText, verify reviewer system prompt is isolated from builder
- `tools/validateManifest.test.ts` — valid manifest passes, invalid manifest returns errors
- `memory/context-builder.test.ts` — context string is under 800 tokens, includes all memory files
- `engine.integration.test.ts` — mock LLM responses, verify full flow: intent → skill → stream → memory write

---

## 15. What This Unblocks

| Plan | What it needs from Plan 05 |
|---|---|
| Plan 06 (Chat UI) | `agent:run` IPC + streaming events to render in chat panel |
| Plan 07 (Canvas) | `renderComponent` tool firing `component:load` IPC to sandbox |
| Plan 08 (Community) | `searchBlueprints` tool hitting real server API |

---

## 16. File Map

| File | Action |
|---|---|
| `src/main/agent/engine.ts` | Create |
| `src/main/agent/intent.ts` | Create |
| `src/main/agent/providers.ts` | Create |
| `src/main/agent/ipc.ts` | Create |
| `src/main/agent/skills/index.ts` | Create |
| `src/main/agent/skills/component-builder.ts` | Create |
| `src/main/agent/skills/component-modifier.ts` | Create |
| `src/main/agent/skills/manifest-generator.ts` | Create |
| `src/main/agent/skills/component-search.ts` | Create |
| `src/main/agent/skills/state-wirer.ts` | Create |
| `src/main/agent/skills/feedback-iterator.ts` | Create |
| `src/main/agent/skills/style-applier.ts` | Create |
| `src/main/agent/tools/index.ts` | Create |
| `src/main/agent/tools/renderComponent.ts` | Create |
| `src/main/agent/tools/readManifest.ts` | Create |
| `src/main/agent/tools/writeComponent.ts` | Create |
| `src/main/agent/tools/searchBlueprints.ts` | Create |
| `src/main/agent/tools/readProjectContext.ts` | Create |
| `src/main/agent/tools/validateManifest.ts` | Create |
| `src/main/agent/tools/reviewCode.ts` | Create |
| `src/main/agent/memory/index.ts` | Create |
| `src/main/agent/memory/context-builder.ts` | Create |
| `src/main/index.ts` | Modify — register agent IPC |
| `src/preload/channels.ts` | Modify — add agent channels |
