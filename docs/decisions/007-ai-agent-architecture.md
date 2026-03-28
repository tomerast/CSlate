# Decision 007: AI Agent Architecture

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate needs a local AI agent that helps users build components via natural language. Users provide their own LLM configuration (API keys, model choice). CSlate provides the agent's skills, workflows, memory, and core identity.

## Decision

**Orchestrator + specialized sub-agents, modeled after Claude Code's architecture.**

The agent system has a core identity ("CSlate Agent") that knows how to build perfect component bundles within the platform, with extensible skills, memories, workflows, MCP servers, and the ability to spin up sub-agents for complex tasks.

## Architecture

```
+------------------------------------------------------------------+
|  CSLATE AGENT (Orchestrator)                                      |
|  Core identity: Expert at building components within CSlate       |
|  - Understands the platform, manifest format, component patterns  |
|  - Routes to specialized sub-agents                               |
|  - Manages conversation context + memory                          |
|  - User-configurable LLM provider (OpenAI, Anthropic, etc.)      |
+------------------------------------------------------------------+
        |
        |--- SKILLS (modular capabilities)
        |     |--- component-builder: Generate/modify React components
        |     |--- component-search: Query server DB for similar blueprints
        |     |--- manifest-generator: Create/update component manifests
        |     |--- layout-arranger: Place components on the grid
        |     |--- feedback-iterator: Refine components based on user input
        |     |--- state-wirer: Connect components via Zustand/event bus
        |     |--- (user-defined custom skills)
        |
        |--- MEMORIES (persistent knowledge)
        |     |--- User preferences (color schemes, favorite patterns)
        |     |--- Project context (what the app is about, past decisions)
        |     |--- Component history (what was built, what worked)
        |     |--- Feedback patterns (what the user likes/dislikes)
        |
        |--- WORKFLOWS (multi-step orchestrations)
        |     |--- new-component: intent → search → generate → render → iterate
        |     |--- modify-component: understand change → update code → re-render
        |     |--- connect-components: analyze manifests → wire state/events
        |     |--- upload-component: prepare → upload to server → await review
        |     |--- (user-defined custom workflows)
        |
        |--- MCP SERVERS (external integrations)
        |     |--- CSlate Server API (component DB, search, upload)
        |     |--- External data sources (user-configured)
        |     |--- Third-party APIs (weather, stocks, etc.)
        |     |--- (user-added MCP servers)
        |
        |--- SUB-AGENTS (spun up on demand)
              |--- Code generation agent (focused on writing code)
              |--- Review agent (validates generated code locally)
              |--- Research agent (explores patterns, finds examples)
              |--- (spawned as needed for complex multi-step tasks)
```

## Core Agent Identity

The CSlate Agent has a fixed core identity that persists regardless of user customization:

```
You are the CSlate Agent. You are an expert at building React component
bundles for the CSlate platform. You understand:

- The CSlate component manifest format (inputs, outputs, events, actions)
- The Zustand state store and typed event bus patterns
- How to generate components that work within the sandbox iframe
- How to search the community component database for blueprints
- How to wire components together on the Slate canvas
- The grid layout system and responsive design patterns

You help non-technical users build applications through natural conversation.
You never expose technical complexity — you translate user intent into
working components.
```

Users can extend this identity with custom instructions but cannot override the core.

## Skills System

Skills are modular, pluggable capabilities — similar to Claude Code's skill system:

```typescript
interface AgentSkill {
  name: string;
  description: string;          // Used by orchestrator to decide when to invoke
  trigger: string;              // Pattern/intent that activates this skill
  systemPrompt: string;         // Instructions for the LLM when using this skill
  tools: string[];              // Which tools this skill has access to
  outputFormat?: string;        // Expected output structure
}
```

**Built-in skills:**
- `component-builder` — Generates React + manifest from natural language
- `component-search` — Queries CSlate Server for similar blueprints
- `manifest-generator` — Creates/validates component manifests
- `layout-arranger` — Determines grid placement for new components
- `feedback-iterator` — Refines components based on user feedback
- `state-wirer` — Connects components via store keys and event bus
- `style-applier` — Applies consistent styling (Tailwind, themes)

**User-defined skills:** Users can add custom skills that extend the agent's capabilities for their specific domain (e.g., a "dashboard-builder" skill for data viz apps).

## Memory System

Persistent, file-based memory — similar to Claude Code's memory:

```
~/.cslate/memory/
├── MEMORY.md              # Index file
├── user_preferences.md    # User's style/design preferences
├── project_context.md     # What the app is about
├── component_history.md   # Components built, iterations, outcomes
├── feedback_patterns.md   # What refinements user commonly requests
└── custom/                # User-defined memories
```

**Memory types:**
- **User preferences:** Design taste, color schemes, favorite component patterns
- **Project context:** App purpose, domain, target audience
- **Component history:** What was built, how many iterations, final result
- **Feedback patterns:** Common refinement requests (e.g., "user always wants rounded corners")

Memory makes the agent get better over time — it learns each user's preferences and project context.

## Workflow System

Workflows are multi-step orchestrations that combine skills:

### `new-component` Workflow (Primary)
```
1. PARSE INTENT
   Skill: orchestrator
   Input: user's natural language request
   Output: structured intent (component type, features, data needs)

2. SEARCH BLUEPRINTS
   Skill: component-search
   Input: structured intent
   Output: matching components from server DB (0-N results)

3. SELECT STRATEGY
   Skill: orchestrator
   Decision: use blueprint as base? generate from scratch? combine multiple?

4. GENERATE CODE
   Skill: component-builder
   Input: intent + optional blueprint source code
   Output: React component code + manifest

5. VALIDATE
   Skill: local review (sub-agent)
   Input: generated code + manifest
   Output: validation result, fixes if needed

6. RENDER
   Action: load component into sandbox iframe
   Output: visual result on Slate canvas

7. COLLECT FEEDBACK
   Skill: feedback-iterator
   Input: user's feedback (natural language)
   Decision: iterate (→ step 4) or accept (→ step 8)

8. FINALIZE
   Actions:
   - Save component locally
   - Async upload to CSlate Server for review + cataloging
   - Update memory with component history
```

### `modify-component` Workflow
```
1. Identify target component on Slate
2. Parse modification request
3. Load current source code
4. Generate modified code (preserving manifest compatibility)
5. Re-render in sandbox
6. Collect feedback → iterate or accept
```

### `connect-components` Workflow
```
1. Analyze manifests of all components on Slate
2. Identify potential connections (matching output→input keys)
3. Propose wiring to user
4. Apply state/event connections
5. Test interaction flow
```

## MCP Server Integration

The agent communicates with external services via MCP (Model Context Protocol):

### Built-in MCP Servers
- **CSlate Server** — Component search, upload, retrieval
- **File System** — Read/write local project files
- **Component Renderer** — Control the sandbox iframe

### User-Configurable MCP Servers
Users can add MCP servers to connect external data:
- Database connections (Postgres, MongoDB)
- REST APIs
- Third-party services
- Custom tools

This enables components to be wired to real data sources via the agent.

## Sub-Agent System

The orchestrator can spawn sub-agents for complex tasks:

```typescript
interface SubAgent {
  name: string;
  purpose: string;
  skills: string[];           // Subset of available skills
  context: string;            // Task-specific context
  parentAgent: string;        // Who spawned it
  isolated: boolean;          // Does it get its own conversation context?
}
```

**When sub-agents are used:**
- Complex component generation (research + generate in parallel)
- Multi-component wiring (analyze each component's manifest simultaneously)
- Code review (separate context to avoid bias from generation step)
- Parallel blueprint search + code generation

## User Customization

Users can customize their agent while the core identity is preserved:

### What Users CAN Customize
- LLM provider and model (OpenAI, Anthropic, local models, etc.)
- Custom skills (domain-specific capabilities)
- Custom workflows (domain-specific multi-step processes)
- Custom MCP servers (external integrations)
- Agent personality/tone (formal, casual, brief, detailed)
- Design preferences stored in memory
- Custom system prompt additions

### What Users CANNOT Override
- Core CSlate Agent identity (knows the platform, manifest format, etc.)
- Built-in skills (component-builder, search, manifest-generator, etc.)
- Security constraints (sandbox rules, code review requirements)
- Component manifest format
- Communication protocol with sandbox iframe

## LLM Provider Configuration

```typescript
interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'local' | 'custom';
  apiKey?: string;              // Stored securely in OS keychain
  model: string;                // e.g., 'gpt-4o', 'claude-sonnet-4-5-20250514', 'gemini-pro'
  baseUrl?: string;             // For custom/local providers
  maxTokens?: number;
  temperature?: number;

  // Optional: different models for different tasks
  overrides?: {
    codeGeneration?: { model: string };   // Use powerful model for code gen
    search?: { model: string };            // Use fast model for search intent
    feedback?: { model: string };          // Use fast model for feedback parsing
  }
}
```

Users configure once in settings. The agent handles all LLM calls transparently, routing to the right model per task.

## Rationale

This architecture mirrors Claude Code's proven patterns because:

1. **Skills = modularity.** New capabilities can be added without changing the core agent.
2. **Memory = personalization.** The agent gets better over time for each user.
3. **Workflows = predictability.** Complex multi-step operations follow defined paths.
4. **MCP = extensibility.** External integrations without modifying agent code.
5. **Sub-agents = scalability.** Complex tasks are parallelized.
6. **Core identity = consistency.** The agent always knows CSlate's platform, regardless of customization.
7. **User customization = flexibility.** Users adapt the agent to their domain without breaking platform knowledge.
