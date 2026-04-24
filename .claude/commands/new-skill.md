# Adding a New Agent Skill

Skills are the high-level tasks the agent performs: building components, modifying them, searching, etc. Each skill maps to one entry in the intent classifier.

## File Location

```
src/main/agent/skills/<skill-name>.ts
```

## Step 1 — Add the skill name to intent.ts

```typescript
// src/main/agent/intent.ts
export const SkillNameSchema = z.enum([
  // ... existing skills ...
  'my-new-skill',  // ADD HERE
])
```

Also add a description in the `INTENT_SYSTEM` prompt:
```
- my-new-skill: User wants to [describe trigger phrases and intent]
```

## Step 2 — Create the skill file

```typescript
// src/main/agent/skills/my-new-skill.ts
import { streamText } from 'ai'
import type { Intent } from '../intent'
import type { LLMConfig } from '../providers'
import type { buildRegistry } from '../providers'
import type { buildTools } from '../tools'
import { COMPONENT_CODE_RULES } from '../prompts/fragments'
import { engineLog } from '../lib/logger'

export async function runMyNewSkill(
  intent: Intent,
  messages: CoreMessage[],
  config: LLMConfig,
  registry: ReturnType<typeof buildRegistry>,
  tools: ReturnType<typeof buildTools>,
): Promise<ReadableStream<string>> {
  const modelId = config.llmModel
  engineLog.debug({ modelId, skill: 'my-new-skill' }, 'streamText starting')

  const { textStream } = await streamText({
    model: (registry as any).languageModel(modelId),
    system: `You are a CSlate component expert. ${COMPONENT_CODE_RULES}

Your task: [describe what this skill does]`,
    messages,
    tools: {
      // pick the tools this skill needs
      renderComponent: tools.renderComponent,
      writeComponent: tools.writeComponent,
    },
    maxSteps: 10,
  })

  return textStream
}
```

## Step 3 — Register in skills/index.ts

```typescript
// src/main/agent/skills/index.ts
import { runMyNewSkill } from './my-new-skill'

export { runMyNewSkill }
```

## Step 4 — Wire into engine.ts

```typescript
// src/main/agent/engine.ts
import { runMyNewSkill } from './skills'

// In the skill dispatch switch/if:
case 'my-new-skill':
  return runMyNewSkill(intent, messages, config, registry, tools)
```

## Prompt Fragments

Reusable prompt content is in `src/main/agent/prompts/fragments.ts`:

```typescript
export const COMPONENT_CODE_RULES = `...`  // esbuild CJS rules, default export, etc.
export const CHAT_CONTEXT = `...`          // current conversation/card context
```

Use these in your system prompt to stay consistent with other skills.

## Available Tools

| Tool | Use for |
|------|---------|
| `renderComponent` | Build + preview a component (no persistence) |
| `writeComponent` | Write source + bundle to disk for inline cards |
| `readManifest` | Read a component's manifest.json |
| `readProjectContext` | Read project manifests and card context |
| `searchBlueprints` | Search server for existing components |
| `reviewCode` | LLM self-review of generated code |
| `validateManifest` | Validate manifest against schema |

## Testing

Skills are harder to unit test due to LLM calls. Test the tool integrations instead.
For integration testing, use the running app and watch logs:

```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.module == "engine" or .module == "intent")'
```

Look for:
- `parseIntent done` with `skill: "my-new-skill"` — classifier picked your skill
- `streamText starting` — LLM call fired
- `tool-call` / `tool-result` — tools being called
- `skill stream finished` — done
