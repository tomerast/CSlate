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
- The sandbox environment enforces all of the above constraints at runtime

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
