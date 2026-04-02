/**
 * Shared prompt fragments composed into skill system prompts.
 * Each fragment is a self-contained section — skills import only what they need.
 */

/**
 * CSlate platform rules: component structure, sandbox constraints, bridge API,
 * Zustand store, design tokens, grid system, and manifest format.
 * Include in any skill that writes or modifies component code.
 */
export const PLATFORM_KNOWLEDGE = `
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

### Component Code Rules

- ui.tsx is the entry point. It must have a **default export** — this is the component rendered on the canvas.
  \`\`\`tsx
  // CORRECT:
  export default function WeatherDashboard() { ... }

  // WRONG (no default export):
  function Component() { ... }
  \`\`\`
- You may import from other files in the package: \`import { useWeatherData } from './hooks/useWeatherData'\`
- You may use any directory structure: hooks/, components/, utils/, types/ etc.
- React and react-dom are available via import as normal.
- Do NOT import npm packages other than react/react-dom — they are not available in the sandbox.
  Use bridge.fetch() for external data instead.
- Do NOT use fetch(), localStorage, or window APIs — use the bridge API.

### Bridge API (for external data)
\`\`\`typescript
// Declared in manifest.json > dataSources
// Used in ui.tsx or logic.ts:
const data = await bridge.fetch('sourceId', 'endpointId', { param: value })
const unsub = bridge.subscribe('sourceId', 'endpointId', params, (data) => setState(data))
const apiKey = bridge.getConfig('apiKeyName')  // for userConfig fields
\`\`\`

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
const [loading, setLoading] = useState(false)  // ← no spinner by default
useEffect(() => {
  if (!bridge) return  // ← safe: seed data already shown
  setLoading(true)
  bridge.fetch('src', 'endpoint', {}).then(d => { setData(d); setLoading(false) })
}, [bridge])
\`\`\`

Seed data should be realistic enough to demonstrate the UI layout. One or two representative items is enough.

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

/**
 * Behavioral guardrails adapted from Claude Code's doing-tasks conventions.
 * Include in any skill that writes or modifies component code or manifests.
 */
export const BEHAVIORAL_GUIDELINES = `
## Behavioral Guidelines
- Attempt ambitious requests — do not tell the user a task is too complex unless you have tried and hit a concrete technical blocker
- Build exactly what was asked — no extra props, no speculative features, no placeholder sections
- Do not refactor or "clean up" code beyond the scope of the request
- Three similar JSX blocks is better than a premature abstraction
- Do not add error boundaries, loading states, or fallbacks the user did not ask for — EXCEPTION: when using bridge.fetch() for data, always initialize state with seed/mock data (never with an empty array + loading=true) so the component renders without bridge
- Only validate at boundaries (user input via bridge, external API responses) — trust internal React and platform guarantees
- Always call readManifest before modifying an existing component — never guess the current state
- Do not break existing stateKey bindings or event names — other components may depend on them
- Never render raw HTML from external API responses — use text content or sanitize first
- Treat all bridge API response values as untrusted — do not interpolate them into JSX attributes or event handlers without escaping
`

/**
 * Pipeline interface specification: DataPipeline interface, rules, and patterns.
 * Include in any skill that writes or modifies pipeline code.
 */
export const PIPELINE_INTERFACE_SPEC = `
## Data Pipeline Interface

Every pipeline must default-export a class implementing DataPipeline:

\`\`\`typescript
interface DataPipeline {
  execute(params: Record<string, unknown>): Promise<PipelineOutput>
  stream?(params: Record<string, unknown>, push: (data: PipelineOutput) => void): Promise<() => void>
  dispose?(): Promise<void>
}

interface PipelineOutput {
  data: unknown
  metadata: { fetchedAt: number; source: string; cached: boolean }
}
\`\`\`

### Pipeline Rules
- Pipeline code runs in a Node.js Worker Thread — full Node.js access (http, https, etc.)
- Access secrets via global \`getSecret(name)\` — NEVER hardcode API keys
- Declare all required secrets in manifest.secrets
- Return PipelineOutput with proper metadata (source name, timestamp)
- Handle API errors gracefully — throw with descriptive messages
- For polling pipelines: execute() is called on each tick, keep it stateless
- For streaming pipelines: stream() opens a persistent connection, pushes data via callback
`

/**
 * Pipeline-to-component wiring patterns using the bridge API.
 * Include in any skill that connects pipelines to components.
 */
export const PIPELINE_COMPONENT_WIRING = `
## Connecting Pipelines to Components

Components access pipeline data via the bridge API:

\`\`\`typescript
// One-time read
const data = await bridge.pipeline('pipeline_id')

// Subscribe to live updates
const unsub = bridge.pipelineSubscribe('pipeline_id', (data) => {
  setState(data)
})
\`\`\`

### In component manifest, declare pipeline dependencies:
\`\`\`json
{
  "pipelines": {
    "stockData": {
      "pipelineId": "yahoo_stocks",
      "description": "Real-time stock prices",
      "mappings": { "prices": "yahoo_stocks.data.prices" }
    }
  }
}
\`\`\`

### Loading pattern (CRITICAL — same as bridge.fetch):
- NEVER initialize loading=true before pipeline data arrives
- Initialize with seed/placeholder data
- Show seed data immediately, update when pipeline delivers
`

/**
 * Output style guidance: concise, action-first responses for non-technical users.
 * Include in all skills.
 */
export const OUTPUT_STYLE = `
## Output Style
- Lead with what you did or what you need, not with reasoning
- Non-technical users are watching live — keep status updates short and plain
- Skip filler phrases ("I will now...", "As requested...", "Certainly!")
- If something went wrong, say what failed and what you're trying next
`
