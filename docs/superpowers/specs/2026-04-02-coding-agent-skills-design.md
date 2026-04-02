# Coding Agent Skills — Design Spec
**Date:** 2026-04-02  
**Branch:** feature/coding-agent-skills  
**Status:** Approved

---

## Overview

Enrich CSlate's sub-agents with a full coding toolkit drawn from the reference implementation (`/Users/tomerast/Downloads/Slate/ref/src`). The goal is to give build agents, fix agents, and the orchestrator the tools they need to explore context, verify output, and fetch documentation — without overloading any individual agent with tools outside its role.

---

## Background

### Current State

CSlate's agent has two sub-agent types and one orchestrator:

| Agent | Role | Current Tools |
|-------|------|--------------|
| `spawnBuildAgent` | Write one component file (ui.tsx, logic.ts, types.ts) | None — generates code from system prompt only |
| `spawnFixAgent` | Patch a broken file given an error message | None — fixes from system prompt only |
| `Orchestrator` | Plan, dispatch, assemble, validate, ship | searchBlueprints, scanLocalComponents, readProjectContext, readManifest, planComponent, dispatchSubAgents, assembleAndValidate, dispatchFixAgents |

**Gap:** Sub-agents write code blindly — no ability to read related files for context, verify output with tsc/eslint, search the project, or fetch documentation.

### Reference Implementation

The reference repo (`/Users/tomerast/Downloads/Slate/ref/src`) implements ~44 tools including:
- `BashTool` — shell execution with AST-based security analysis and permission framework
- `FileReadTool` — read any file with line range support
- `FileEditTool` — edit files (not needed for CSlate's generate-and-write model)
- `GrepTool` — regex search across files
- `GlobTool` — file pattern matching
- `WebFetchTool` — fetch web content
- `LSPTool` — language server / TypeScript diagnostics
- Full tool orchestration: concurrency control, result size management, abort hierarchy

---

## Design

### Approach: Role-Optimized Tool Sets

Each agent tier receives the tools that match its job. Three tiers, three tool sets. This respects existing token budgets and avoids diluting focus with irrelevant tools.

---

### New Tools (6)

All new tools live in `src/main/agent/tools/` and follow the existing `buildTool(context)` factory pattern with Zod input validation, `isReadOnly()`, `isConcurrencySafe()`, and `maxResultSizeChars`.

#### 1. `readFile`
```typescript
input: { path: string; lineRange?: { start: number; end: number } }
output: { content: string } | { error: string }
```
- Reads any file within `projectDir` (path traversal protection via `safePath()`)
- Supports partial reads via `lineRange` for large files
- **Read-only, concurrency-safe**
- Max result: 100KB

#### 2. `grep`
```typescript
input: { pattern: string; path?: string; glob?: string; caseInsensitive?: boolean }
output: { matches: Array<{ file: string; line: number; content: string }> } | { error: string }
```
- Regex search across project files using ripgrep (`rg`) if available, falling back to Node.js `fs` + regex scan
- Scoped to `projectDir` by default; `path` overrides to a subdir
- `glob` filters file types (e.g. `"*.tsx"`)
- **Read-only, concurrency-safe**
- Max result: 50KB

#### 3. `glob`
```typescript
input: { pattern: string; cwd?: string }
output: { files: string[] } | { error: string }
```
- File pattern matching (e.g. `"components/**/*.tsx"`)
- `cwd` defaults to `projectDir`
- Uses Node.js `glob` package (already in repo via esbuild deps)
- **Read-only, concurrency-safe**
- Max result: 50KB

#### 4. `bash`
```typescript
input: { command: string; cwd?: string; timeout?: number }
output: { stdout: string; stderr: string; exitCode: number } | { error: string }
```
- Executes shell commands via `child_process.spawn`
- `cwd` defaults to `projectDir`; paths outside `projectDir` validated with `safePath()`
- `timeout` defaults to 30s, max 120s
- Permission check before execution (see Bash Permission Model below)
- Abort-signal aware — kills child process on agent abort
- **NOT read-only, NOT concurrency-safe**
- Max result: 100KB

#### 5. `lsp`
```typescript
input: { files?: string[] }
output: { diagnostics: Array<{ file: string; line: number; col: number; message: string; severity: 'error'|'warning' }> } | { error: string }
```
- Runs `tsc --noEmit --pretty false` in `projectDir` and parses output
- `files` optionally scopes diagnostics to specific paths
- Returns structured diagnostics — no raw tsc output
- Requires `tsconfig.json` in `projectDir` (graceful error if absent)
- **Read-only, NOT concurrency-safe** (tsc uses project-wide state)
- Max result: 50KB

#### 6. `webFetch`
```typescript
input: { url?: string; query?: string }
output: { content: string; source: 'cslate-server' | 'web' } | { error: string }
```
- **Search priority:** When `query` is provided (not a direct URL):
  1. Call `searchBlueprints(query)` on the CSlate server first
  2. If results are empty, fall back to `https://api.duckduckgo.com/?q={query}&format=json` (no API key required) and return the top abstract/result
- Direct `url` fetches the URL via Node.js `fetch`, strips HTML to plain text using `cheerio` (load → `$('body').text()`), truncates to `maxResultSizeChars`
- Direct `url` bypasses the CSlate server entirely
- **Read-only, concurrency-safe**
- Max result: 50KB

---

### Tool Set Assignments

`buildToolSet(context, tier)` in `src/main/agent/tools/index.ts` accepts a new `tier` parameter:

#### Build agents — context gathering before writing
```
Existing: validateManifest, readManifest, readProjectContext, 
          searchBlueprints, scanLocalComponents
New:      readFile, grep, glob, webFetch
```
*Rationale:* Build agents write new code. They need to read existing project files for patterns, search for type definitions, and fetch documentation. They do not need bash or LSP — they don't execute or verify code, the orchestrator's assembleAndValidate step does that.

#### Fix agents — verify, understand, patch
```
Existing: validateManifest, readManifest, readProjectContext
New:      bash, lsp, readFile, grep, glob
```
*Rationale:* Fix agents receive a broken file + error message. They need bash to run tsc/eslint to verify their fix, LSP for typed diagnostics, and file exploration to understand the surrounding context. No webFetch — fixes should be grounded in the existing codebase, not web searches.

#### Orchestrator — full situational awareness
```
Existing: all orchestrator tools (searchBlueprints, scanLocalComponents, 
          readProjectContext, readManifest, planComponent, 
          dispatchSubAgents, assembleAndValidate, dispatchFixAgents)
New:      bash, lsp, readFile, grep, glob, webFetch
```
*Rationale:* The orchestrator plans and validates. It needs everything.

---

### Bash Permission Model

Before executing any bash command, `bash/permissions.ts` classifies it:

**Silent (auto-approve):**
- Read operations: `cat`, `head`, `tail`, `ls`, `find`, `echo`, `pwd`
- Build/lint: `tsc`, `eslint`, `prettier`, `npm run *`, `npx *`
- Git read: `git status`, `git log`, `git diff`

**Prompt user (via `agent:permission-request` IPC):**
- Destructive file ops: `rm`, `rmdir`, `mv` (to outside projectDir)
- Git writes: `git push`, `git reset`, `git checkout` with file args
- Network: `curl`, `wget`, `npm install` (modifies node_modules)
- Process management: `kill`, `pkill`

**Auto-deny:**
- Commands writing outside `projectDir`
- Shell escapes: `eval`, backtick substitution in dangerous contexts
- Sensitive file access: `.env`, credentials files

Permission prompting uses two new IPC channels:
- `agent:permission-request` → renderer shows a dialog with command preview
- `agent:permission-response` → user approve/deny flows back to the tool

---

### Infrastructure Changes

#### Modified files

**`src/main/agent/tools/index.ts`**
- Add `tier: 'build' | 'fix' | 'orchestrator'` to `buildToolSet(context, tier)`
- Return tier-appropriate tool subset

**`src/main/agent/orchestrator/sub-agent.ts`**
- Pass `tier: 'build'` to `spawnBuildAgent`'s `buildToolSet` call
- Pass `tier: 'fix'` to `spawnFixAgent`'s `buildToolSet` call
- Increase `maxTokens` from 8K → 12K for both agents (tool use adds context)

**`src/preload/channels.ts`**
- Add `agent:permission-request`
- Add `agent:permission-response`

#### New files

```
src/main/agent/tools/
  readFile.ts
  grep.ts
  glob.ts
  bash.ts
  bash/
    permissions.ts    ← risky command classifier
    executor.ts       ← child_process wrapper (timeout, abort, cwd)
  lsp.ts
  webFetch.ts
```

---

## Tool Interface Compliance

All new tools must satisfy the existing `CSTool<INPUT, OUTPUT>` contract:

```typescript
interface CSTool<INPUT, OUTPUT> {
  name: string
  description: string
  inputSchema: ZodSchema<INPUT>
  execute(input: INPUT, context: ToolUseContext): Promise<ToolResult<OUTPUT>>
  isReadOnly(): boolean
  isConcurrencySafe(): boolean
  maxResultSizeChars: number
  toAISDKTool(): Tool
}
```

---

## Testing

Each new tool gets a test file in `__tests__/` next to its source:

| Test file | Coverage |
|-----------|----------|
| `readFile.test.ts` | Happy path, path traversal rejection, line range, missing file |
| `grep.test.ts` | Pattern match, no results, scoped path, glob filter |
| `glob.test.ts` | Pattern match, empty results, custom cwd |
| `bash.test.ts` | Silent command runs, risky command prompts, auto-deny, timeout, abort |
| `bash/permissions.test.ts` | Each category of command correctly classified |
| `lsp.test.ts` | Parses tsc output, handles missing tsconfig, scoped files |
| `webFetch.test.ts` | CSlate server hit first, fallback to web, direct URL, HTML stripping |

Bash and LSP tests use mocked `child_process` — no actual shell execution in tests.

---

## Out of Scope

- `FileEditTool` — CSlate uses generate-and-write, not in-place patching of arbitrary files
- `WebSearchTool` — covered by `webFetch` with query mode
- `AskUserQuestionTool` for sub-agents — only orchestrator asks questions (via existing IPC)
- `NotebookEditTool`, `PowerShellTool`, `REPLTool` — not relevant to component building
- Context compaction / reactive compact — separate concern, not part of this spec
