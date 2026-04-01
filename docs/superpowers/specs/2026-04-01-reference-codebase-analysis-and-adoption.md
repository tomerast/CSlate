# Reference Codebase Analysis & Adoption Plan

**Date:** 2026-04-01  
**Status:** Draft  
**Sources:** `claw-code-main.zip` (Rust Claude Code clone), `src.zip` (Claude Code CLI source)

---

## 1. Executive Summary

Deep analysis of two reference codebases — the Claude Code CLI source (TypeScript, ~500+ files) and claw-code (Rust-based Claude Code alternative) — reveals several architectural patterns that would significantly improve CSlate's agent engine. The key adoptable patterns are:

1. **Typed Tool Interface with `buildTool()` factory** — replaces CSlate's ad-hoc `create*Tool()` pattern
2. **StreamingToolExecutor with concurrency partitioning** — tools execute in parallel when safe
3. **Formal QueryEngine loop** — structured turn management with compaction, budget tracking, abort
4. **Skill system with frontmatter-based discovery** — replaces CSlate's hardcoded skill registry
5. **Tool result budgeting & context compaction** — prevents context overflow in long sessions
6. **Structured permission model** — tool-level permission checking with deny/allow rules

CSlate's **deterministic orchestrator loop** (plan → dispatch sub-agents → assemble → validate → ship) is a strength not found in either reference codebase and must be preserved.

---

## 2. Reference Codebase Analysis

### 2.1 Claude Code CLI (src.zip)

**Architecture:**
```
QueryEngine (owns conversation lifecycle)
  └─ query() loop (while true)
       ├─ Auto-compact / micro-compact / snip
       ├─ Build system prompt (fragments + user context + system context)
       ├─ StreamingToolExecutor (parallel-safe tools run concurrently)
       ├─ Tool result budgeting (large results persisted to disk)
       ├─ Stop hooks (post-turn lifecycle)
       └─ Continue/Terminal transitions
```

**Key patterns:**

| Pattern | Description | CSlate Relevance |
|---------|-------------|-----------------|
| `Tool` interface (Tool.ts) | 40+ methods: `call()`, `checkPermissions()`, `isReadOnly()`, `isConcurrencySafe()`, `prompt()`, `validateInput()`, rendering methods | HIGH — CSlate tools lack permission checking, concurrency info, validation |
| `buildTool()` factory | Safe defaults (`isEnabled: true`, `isConcurrencySafe: false`, `isReadOnly: false`), fail-closed | HIGH — eliminates boilerplate, ensures safety |
| `StreamingToolExecutor` | Partitions tool calls into concurrent-safe batches vs serial batches. Tracks status per tool. | MEDIUM — CSlate runs tools serially in orchestrator |
| `QueryEngine` class | Owns messages, abort controller, usage tracking, file state cache. `submitMessage()` is an AsyncGenerator yielding SDK messages | HIGH — CSlate's `AgentEngine.stream()` is simpler but similar |
| `query()` loop | Infinite loop with explicit `State` object, continue/terminal transitions, auto-compaction, microcompact, snip | HIGH — CSlate lacks compaction entirely |
| Skill system | Markdown files with YAML frontmatter (`name`, `description`, `when_to_use`, `allowed-tools`, `model`, `paths`). Loaded from `~/.claude/skills/`, `.claude/skills/`, plugins. Dynamic discovery on file touch. | MEDIUM — CSlate has hardcoded skills, could benefit from file-based |
| Permission model | `ToolPermissionContext` with `alwaysAllowRules`, `alwaysDenyRules`, per-tool `checkPermissions()` | LOW for CSlate (Electron app, user trusts agent) |
| Tool result storage | Large results (> `maxResultSizeChars`) persisted to disk, replaced with preview + path | HIGH — prevents context blowup |
| Context compaction | Auto-compact when approaching context limit. Summarizes old conversation, preserves recent. `compact_boundary` messages. | HIGH — critical for long sessions |
| Task system | `TaskType` (local_bash, local_agent, remote_agent), `TaskStatus` with terminal state checking, background execution | MEDIUM — CSlate has sub-agents but no task abstraction |

### 2.2 claw-code (Rust)

**Architecture:**
```
rusty-claude-cli (TUI)
  └─ runtime crate
       ├─ conversation.rs — turn management
       ├─ session.rs — persistence
       ├─ prompt.rs — system prompt construction
       ├─ bash.rs — shell execution
       ├─ permissions.rs — permission model
       ├─ hooks.rs — lifecycle hooks
       └─ sandbox.rs — sandboxed execution
```

**Key patterns:**

| Pattern | Description | CSlate Relevance |
|---------|-------------|-----------------|
| Session persistence | JSON session files in `.claude/sessions/` | LOW — CSlate uses Zustand stores + canvas.json |
| Conversation turn management | Explicit turn boundaries, message normalization | MEDIUM — informative for CSlate's conversation history |
| Structured prompt construction | Composable prompt fragments | HIGH — validates CSlate's fragments.ts approach |

claw-code is a faithful reimplementation in Rust — useful as a second data point confirming Claude Code's architecture, but doesn't introduce novel patterns beyond what src.zip provides.

---

## 3. Current CSlate Agent Architecture

```
AgentEngine.stream()
  ├─ classifyIntent() → route
  ├─ Route: orchestrator
  │    └─ Orchestrator.stream()
  │         ├─ searchBlueprints → planComponent → dispatchSubAgents
  │         ├─ Sub-agents (spawnBuildAgent / spawnFixAgent)
  │         │    └─ streamText() with tools (deterministic coding loop)
  │         ├─ assembleAndValidate → renderComponent
  │         └─ publishComponent → writeComponent
  ├─ Route: skill (state-wirer, component-search)
  │    └─ skillRegistry[name].run()
  └─ Route: direct (streamText with tools)
```

**Strengths to preserve:**
- Deterministic orchestrator loop (plan → build → validate → ship)
- Sub-agent pattern for isolated component building
- Intent-based routing with structured output
- Staging/resume system for crash recovery
- Blueprint search integration with CSlate-server

**Gaps identified:**
1. No context compaction — long sessions will hit context limits
2. Tools are ad-hoc factory functions, no shared interface
3. No tool concurrency — everything runs serially
4. No tool result budgeting — large manifests/code could blow context
5. Skills are hardcoded in a registry map
6. No abort/cancellation support during tool execution
7. No tool validation layer (input validation before execution)
8. No formal conversation turn tracking

---

## 4. Adoption Plan

### 4.1 Adopt: Typed Tool Interface with `buildTool()`

**What:** Create a `Tool` type and `buildTool()` factory that all CSlate tools implement.

**From reference (Tool.ts:362-792):**
```typescript
// Simplified for CSlate — keep what matters, drop CLI-specific rendering
export type CSlateToolDef<Input extends z.ZodObject<any>, Output = unknown> = {
  name: string
  description: string
  inputSchema: Input
  call(args: z.infer<Input>, context: ToolUseContext): Promise<ToolResult<Output>>
  isConcurrencySafe?(input: z.infer<Input>): boolean  // default: false
  isReadOnly?(input: z.infer<Input>): boolean          // default: false  
  validateInput?(input: z.infer<Input>): Promise<ValidationResult>
  maxResultSizeChars?: number                           // default: 50_000
}
```

**Why:** Every CSlate tool currently has a different shape. `buildTool()` provides safe defaults and a consistent interface. This also enables the StreamingToolExecutor pattern.

**Changes:**
- New file: `src/main/agent/tools/types.ts` — `Tool`, `ToolResult`, `ToolUseContext`, `buildTool()`
- Refactor all 8 existing tools to use `buildTool()`
- Tool registry becomes `Tool[]` instead of ad-hoc object

### 4.2 Adopt: Context Compaction

**What:** When conversation approaches context limit, summarize older turns and replace with compact summary.

**From reference (services/compact/):**
- `autoCompact.ts` — detects when compaction is needed
- `compact.ts` — builds post-compact messages (summary + preserved recent)
- `microCompact.ts` — lighter-weight individual message compaction

**Simplified for CSlate:**
```typescript
// Trigger: when estimated tokens > 80% of model context window
// Action: summarize all but last 3 turns into a compact summary
// Preserve: system prompt, compact summary, recent turns, active component manifests
```

**Why:** CSlate sessions can be long (iterating on components). Without compaction, users hit context limits and the agent fails. This is the highest-impact adoption.

**Changes:**
- New file: `src/main/agent/compact.ts` — `autoCompactIfNeeded()`, token estimation
- Integrate into orchestrator loop and direct-route streamText calls
- Add `compact_boundary` concept to conversation history

### 4.3 Adopt: Tool Result Budgeting

**What:** When a tool returns a result larger than `maxResultSizeChars`, persist to disk and replace with a truncated preview + file path reference.

**From reference (utils/toolResultStorage.ts):**
- Per-tool configurable max size
- Results persisted to temp files
- Model sees preview + "Full output saved to: /path"

**Simplified for CSlate:**
```typescript
const MAX_RESULT_CHARS = 50_000 // ~12k tokens
function budgetToolResult(result: string, toolName: string): string {
  if (result.length <= MAX_RESULT_CHARS) return result
  const preview = result.slice(0, MAX_RESULT_CHARS)
  const path = persistToTemp(result, toolName)
  return `${preview}\n\n[Truncated — full output: ${path}]`
}
```

**Why:** Component code, manifests, and project context can be large. Without budgeting, a single tool result can consume 30%+ of context.

**Changes:**
- New utility: `src/main/agent/lib/resultBudget.ts`
- Apply in tool execution layer (before results enter conversation)

### 4.4 Adopt: Streaming Tool Executor with Concurrency

**What:** When multiple tools are called in one turn, partition into concurrent-safe (read-only) and serial (write) batches.

**From reference (services/tools/StreamingToolExecutor.ts, toolOrchestration.ts):**
- `partitionToolCalls()` groups consecutive read-only tools into batches
- Read-only batches execute concurrently (up to 10)
- Write tools execute serially

**Simplified for CSlate:**
```typescript
// Read-only tools: readManifest, readProjectContext, scanLocalComponents, searchBlueprints
// Write tools: renderComponent, writeComponent
// Mixed: reviewCode (reads, but expensive — serial)
```

**Why:** The orchestrator currently runs tools serially. Running reads concurrently (blueprint search + manifest read + project context) can save 2-5 seconds per turn.

**Changes:**
- Mark tools with `isConcurrencySafe` / `isReadOnly` via `buildTool()`
- New executor: `src/main/agent/lib/toolExecutor.ts`
- Integrate into orchestrator's `streamText()` calls

### 4.5 Adopt: Abort Controller Pattern

**What:** Thread an `AbortController` through the tool execution pipeline so cancellation is clean.

**From reference (Tool.ts:186, StreamingToolExecutor.ts:58-60):**
- `ToolUseContext.abortController` — parent signal
- `siblingAbortController` — child signal that kills sibling tools on error without aborting parent

**Why:** CSlate has no cancellation mechanism. If a user sends a new message during a build, there's no way to stop the current operation. The Electron IPC already has a `cancel` concept but it doesn't propagate.

**Changes:**
- Add `abortController` to `ToolUseContext` (passed through orchestrator)
- Wire into `streamText()` calls and sub-agent spawning
- Connect to Electron IPC `agent:cancel` channel

### 4.6 Consider (Future): File-Based Skill System

**What:** Load skills from `.claude/skills/skill-name/SKILL.md` with YAML frontmatter instead of hardcoded registry.

**From reference (skills/loadSkillsDir.ts):**
- Frontmatter: `name`, `description`, `when_to_use`, `allowed-tools`, `model`, `paths`
- Dynamic discovery when touching files in skill directories
- Conditional activation based on file paths

**Why this is FUTURE, not immediate:** CSlate's skills are domain-specific (state-wirer, component-search) and tightly integrated with the orchestrator tools. File-based discovery adds flexibility but the current 2-skill registry works fine. Adopt when skill count grows past 5-6.

**No changes now.** Document as future enhancement.

---

## 5. What NOT to Adopt

| Pattern | Why Skip |
|---------|----------|
| Permission model (allow/deny rules) | CSlate is a desktop app — the user trusts the agent. No interactive permission prompts needed. |
| CLI rendering (renderToolUseMessage, etc.) | CSlate renders in React on a canvas, not a terminal |
| Session persistence to JSON files | CSlate uses Zustand stores + canvas.json — different paradigm |
| MCP server integration | CSlate uses CSlate-server HTTP API, not MCP protocol |
| Hooks system (pre/post tool hooks) | Overkill for CSlate's current scope |
| ToolSearch / deferred tool loading | CSlate has <10 tools, no need for lazy loading |
| Task types (local_bash, remote_agent) | CSlate's sub-agent pattern is simpler and sufficient |

---

## 6. Implementation Priority

| Priority | Pattern | Impact | Effort | Risk |
|----------|---------|--------|--------|------|
| P0 | Context compaction | Critical — prevents session failures | Medium | Low |
| P0 | Tool result budgeting | Critical — prevents context blowup | Low | Low |
| P1 | Typed Tool interface + buildTool() | High — enables all other improvements | Medium | Low |
| P1 | Abort controller threading | High — enables cancellation | Low | Low |
| P2 | Streaming tool executor (concurrency) | Medium — performance improvement | Medium | Medium |
| P3 | File-based skill system | Low — future flexibility | High | Low |

---

## 7. Architecture After Adoption

```
AgentEngine.stream()
  ├─ AbortController created, threaded through all tools
  ├─ classifyIntent() → route
  ├─ Route: orchestrator
  │    └─ Orchestrator.stream()
  │         ├─ autoCompactIfNeeded(messages) ← NEW
  │         ├─ searchBlueprints → planComponent → dispatchSubAgents
  │         ├─ StreamingToolExecutor ← NEW (concurrent reads)
  │         │    └─ Tools implement Tool interface via buildTool() ← NEW
  │         │         └─ Results pass through budgetToolResult() ← NEW  
  │         ├─ Sub-agents (with abort propagation) ← ENHANCED
  │         ├─ assembleAndValidate → renderComponent
  │         └─ publishComponent → writeComponent
  ├─ Route: skill
  │    └─ skillRegistry[name].run() (unchanged, future: file-based)
  └─ Route: direct
       └─ streamText (with compaction + budgeting)
```

**Key constraint:** The deterministic orchestrator loop (plan → build → validate → ship) is preserved exactly. Adoptions wrap around it, never replace it.

---

## 8. New Files

```
src/main/agent/
  tools/
    types.ts          — Tool, ToolResult, ToolUseContext, buildTool(), ValidationResult
  lib/
    toolExecutor.ts   — StreamingToolExecutor (partitioning + concurrent execution)
    resultBudget.ts   — budgetToolResult(), persistToTemp()
    compact.ts        — autoCompactIfNeeded(), estimateTokens(), buildCompactSummary()
    abortUtils.ts     — createChildAbortController()
```

## 9. Modified Files

```
src/main/agent/
  engine.ts           — Thread AbortController, integrate compaction
  orchestrator/
    index.ts          — Use StreamingToolExecutor, compaction before turns
    sub-agent.ts      — Accept AbortController, propagate cancellation
  tools/
    index.ts          — Export Tool[] array instead of named exports
    *.ts (all tools)  — Refactor to use buildTool()
```
