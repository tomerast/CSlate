# Decision 010: App Structure — Tabs and Navigation

**Date:** 2026-03-28
**Status:** Accepted (v1 — revisit for future versions)

## Context

CSlate apps are composed of multiple tabs/pages. Users need a way to create, switch between, and manage these.

## Decision

**Browser-like tab bar for v1.**

### Design

- Tab bar at the top of the window (below the title bar)
- "+" button to add a new Slate tab
- Each tab is an independent Slate with its own:
  - Grid canvas with components
  - Zustand state store (tab-scoped)
  - Chat conversation history
- Drag tabs to reorder
- Right-click tab for context menu: Rename, Duplicate, Close
- Close button (×) on each tab
- Double-click tab label to rename inline

### Tab Data Model

```typescript
interface SlateTab {
  id: string;
  name: string;
  order: number;
  components: ComponentInstance[];   // Components placed on this Slate
  stateStore: Record<string, any>;  // Tab-scoped Zustand state
  chatHistory: ChatMessage[];       // AI conversation for this tab
  theme?: Partial<SlateTheme>;      // Optional tab-level theme override
  gridConfig: GridConfig;           // Grid layout settings
}
```

### Why Browser-Style Tabs

- Most familiar mental model for non-technical users
- Minimal UI footprint
- Each tab is self-contained — easy to reason about
- Simple to implement

### Future Considerations

This decision is explicitly scoped to v1. Future versions may add:
- Sidebar page tree (Notion-style) for complex apps with many pages
- Nested pages / page hierarchy
- Tab groups
- Cross-tab navigation components (nav bars, menus that link between tabs)
- Tab templates (start from a pre-built layout)

These will be revisited as user needs become clearer.
