# Decision 013: Grid System Design

**Date:** 2026-03-28
**Status:** Accepted

## Context

The Slate canvas uses a structured layout with a dense, dynamic grid (Decision 002). We need to define the grid granularity.

## Decision

**Pixel-based grid with 8px base unit and snap-to-grid behavior.**

### Grid Specification

```typescript
interface GridConfig {
  baseUnit: number;          // 8px — all dimensions snap to multiples of this
  showGrid: boolean;         // Toggle grid visibility
  snapEnabled: boolean;      // Toggle snap behavior
  gutterSize: number;        // Gap between components (default: 8px = 1 unit)
  padding: number;           // Canvas edge padding (default: 16px = 2 units)
}
```

### Why 8px Base Unit

- **Industry standard**: Material Design, iOS HIG, and most design systems use 8px grids
- **Dense enough**: Users can position with 8px precision — feels almost free-form
- **Structured enough**: Components always align cleanly, no sub-pixel rendering issues
- **AI-friendly**: Agent can reason about placement in unit multiples ("place at 24 units from top, 16 units from left")
- **Responsive**: 8px multiples scale cleanly across screen sizes

### Component Sizing

```typescript
interface ComponentPlacement {
  x: number;        // Left position in base units (x * 8px)
  y: number;        // Top position in base units (y * 8px)
  width: number;    // Width in base units (width * 8px)
  height: number;   // Height in base units (height * 8px)
}

// Example: A component at position (128px, 64px) with size (320px × 240px)
// Stored as: { x: 16, y: 8, width: 40, height: 30 }
```

### Snap Behavior

- Components snap to nearest 8px multiple when placed or resized
- Drag handles show alignment guides to neighboring components
- Hold `Alt`/`Option` to temporarily disable snapping (for edge cases)
- Smart snapping: components also snap to edges/centers of neighboring components

### AI Placement

The AI agent reasons about placement using semantic zones + unit coordinates:

```
User: "Put a sidebar on the left"
AI: Places component at x=0, y=0, width=32 (256px), height=full

User: "Add a header across the top"
AI: Places component at x=32, y=0, width=remaining, height=8 (64px)
```

### Canvas Coordinates

```
(0,0) ────────────────────────────────→ x (units)
  │  ┌──────────┐  ┌────────────────┐
  │  │ Sidebar   │  │ Header         │
  │  │ x:0 y:0   │  │ x:32 y:0      │
  │  │ w:32 h:96 │  │ w:88 h:8      │
  │  │           │  ├────────────────┤
  │  │           │  │ Main Content   │
  │  │           │  │ x:32 y:8      │
  │  │           │  │ w:88 h:88     │
  │  └──────────┘  └────────────────┘
  ↓
  y (units)
```

### Resize Behavior

- Components have drag handles on all edges and corners
- Minimum size defined in manifest (`minSize`)
- Maximum size: canvas bounds
- Components can overlap (z-index ordering via layer panel, future feature)
- AI can auto-arrange components to avoid overlaps when requested

### Responsive Considerations (Future)

For v1, the grid is absolute positioning within the Slate tab. Future versions may add:
- Breakpoint-based layout switching
- Auto-reflow for different window sizes
- Container queries for component-level responsiveness
