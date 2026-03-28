# Decision 005: Component Communication Model

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate components placed on the Slate need to communicate with each other. The system must work for:
- Non-technical users (they never see "state management")
- AI agents (must reliably wire components together)
- Community components (must be interoperable across unknown combinations)

## Options Evaluated

### Pure Shared State Store (Zustand/Jotai/Redux)
- **Pros:** Single source of truth, queryable current state, simple mental model
- **Cons:** Cannot handle fire-and-forget notifications (toasts, animations, scroll-to)

### Pure Event Bus (Pub/Sub)
- **Pros:** Decoupled, flexible, works with unknown component combos
- **Cons:** Cannot answer "what is the current value?", late-mounting components miss events

### Hybrid: State Store + Event Bus + Component Manifest (Selected)
- **Pros:** Handles all use cases, proven by every successful low-code platform
- **Cons:** Two concepts instead of one (moderate complexity)

## Decision

**Hybrid architecture with three layers:**

### Layer 1: Component Manifest (The Contract)

Every component declares a JSON manifest:

```typescript
interface ComponentManifest {
  id: string;
  name: string;
  description: string;           // Natural language, for AI + humans
  tags: string[];

  inputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;
      required: boolean;
      default?: any;
      stateKey?: string;         // Bind to store key
    }
  };

  outputs: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
      description: string;
      stateKey?: string;         // Store key to write to
    }
  };

  events: {
    [eventName: string]: {
      description: string;
      payload: Record<string, { type: string; description: string }>;
    }
  };

  actions: {
    [actionName: string]: {
      description: string;
      params: Record<string, { type: string; description: string }>;
    }
  };

  defaultSize: { cols: number; rows: number };
  minSize?: { cols: number; rows: number };
}
```

**Why manifests are critical:**
- AI operates on structured metadata, not source code, to wire components
- Community DB indexes manifests for semantic search
- Platform validates wiring against manifests at design time
- Natural language descriptions enable AI semantic matching

### Layer 2: Zustand Store (Shared Reactive State)

Single Zustand store per Slate (tab), optional app-level store for cross-tab state.

**Why Zustand over alternatives:**

| Criterion | Zustand | Jotai | Redux |
|---|---|---|---|
| Dynamic add/remove | Excellent (merge) | Good (leak risk) | Poor (static) |
| AI can wire up | Excellent (key-value) | Moderate (opaque atoms) | Poor (boilerplate) |
| External orchestration | Excellent (getState/setState) | Limited | Moderate |
| No provider needed | Yes | No | No |

**State is scoped:**
- **Tab-scoped**: Each Slate tab has its own store instance
- **App-scoped**: Cross-tab state (user prefs, auth, shared data) in a separate store
- **Namespaced**: Keys follow `componentName.keyName` convention to prevent conflicts

### Layer 3: Typed Event Bus (Notifications & Actions)

Lightweight typed EventEmitter for fire-and-forget patterns:

```typescript
const slateEvents = createEventBus<{
  'todo:added': { text: string; id: string };
  'filter:changed': { filter: 'all' | 'active' | 'done' };
  'component:action': { targetId: string; action: string; params: any };
}>();
```

**Used for:**
- Cross-component notifications ("item clicked", "form submitted")
- Component-to-component actions ("tell chart to refresh")
- Integration points (plugins, external data sources)

## How AI Wires Components

1. User says: "Add a todo list and a form to add todos"
2. AI generates two components with manifests:
   - **TodoForm**: outputs `{ todoList: 'append' }`, events `{ 'todo:added': { text, id } }`
   - **TodoList**: inputs `{ todoList: { type: 'array', stateKey: 'todoList' } }`
3. AI matches: TodoForm writes `todoList` ↔ TodoList reads `todoList` — automatic connection
4. Platform validates: types match, keys align

## Validation: Every Major Low-Code Platform Uses This Pattern

| Platform | State | Events | Contract |
|---|---|---|---|
| Power Apps | Reactive formulas + variables | OnSelect, OnChange | Typed properties |
| Appsmith | storeValue/appsmith.store | Event handlers + triggers | Widget config |
| ToolJet | Page/app variables | Event-driven actions | Component config |
| Retool | State + queries | Event handlers | Component schema |
| **CSlate** | **Zustand store** | **Typed event bus** | **Component manifest** |
