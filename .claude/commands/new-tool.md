# Adding a New Agent Tool

Agent tools are the actions the AI can take: reading files, writing components, searching blueprints, etc.

## File Location

```
src/main/agent/tools/<tool-name>.ts
src/main/agent/tools/__tests__/<tool-name>.test.ts
```

## Tool Template

```typescript
// src/main/agent/tools/myTool.ts
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './index'

export function createMyTool(ctx: ToolContext) {
  return tool({
    description: 'One sentence describing what this tool does and when to use it.',
    parameters: z.object({
      param1: z.string().describe('What this parameter is for'),
      param2: z.number().optional().describe('Optional param'),
    }),
    execute: async ({ param1, param2 }) => {
      // implementation
      return { success: true, result: '...' }
    },
  })
}
```

## ToolContext

Available in `src/main/agent/tools/index.ts`:

```typescript
export interface ToolContext {
  projectDir: string       // active project directory (may be empty string)
  sender: Electron.WebContents  // for sending events back to renderer
}
```

## Register the Tool

In `src/main/agent/tools/index.ts`:

```typescript
import { createMyTool } from './myTool'

export function buildTools(ctx: ToolContext) {
  return {
    // ... existing tools ...
    myTool: createMyTool(ctx),
  }
}
```

## Use in a Skill

Skills access tools via the `tools` parameter. The tool name must match the key in `buildTools()`.

In your skill file (`src/main/agent/skills/my-skill.ts`):

```typescript
const result = await streamText({
  // ...
  tools: { myTool: tools.myTool },
  // or pass all tools:
  tools,
})
```

## Testing

```typescript
// src/main/agent/tools/__tests__/myTool.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createMyTool } from '../myTool'

describe('myTool', () => {
  it('returns success with valid params', async () => {
    const ctx = { projectDir: '/tmp/test', sender: {} as any }
    const tool = createMyTool(ctx)
    const result = await tool.execute({ param1: 'hello' }, { messages: [], toolCallId: '1' })
    expect(result.success).toBe(true)
  })
})
```

Run: `npx vitest run src/main/agent/tools/`

## Gotchas

- `execute` receives `(args, options)` — options has `toolCallId`, `messages`
- Tools that write files must use `safePath()` from `src/main/lib/paths.ts`
- Tools that validate component packages must use `validateComponentPackage()` from `@cslate/shared`
- Tool return values are sent to the LLM as tool results — keep them informative but concise
- If a tool needs to send a progress event to the renderer, use `ctx.sender.send(channel, data)`
