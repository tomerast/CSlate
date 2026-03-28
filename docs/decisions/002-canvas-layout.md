# Decision 002: Slate Canvas Layout Strategy

**Date:** 2026-03-28
**Status:** Accepted

## Context

When users place components on the Slate, we need a strategy for how components are arranged and positioned.

## Options Considered

### A) Free-form Canvas
- Drag components anywhere, like Figma
- Maximum flexibility
- **Rejected:** Complex to turn into real, responsive app layouts. Harder for non-technical users.

### B) Structured Layout with Dense Dynamic Grid (Selected)
- Components snap into a grid/flow layout (rows, columns, sections)
- Grid is dense and dynamic — users can achieve precise positioning
- Output is already a real, responsive app layout
- **Selected:** Simpler mental model for non-technical users. Output is immediately usable.

### C) Hybrid
- Structured by default with free-form toggle
- **Rejected:** Added complexity without clear benefit for the target audience.

## Decision

**Option B: Structured layout with a dense, dynamic grid.**

## Rationale

- Non-technical users (our primary audience) think in terms of "put this here, put that there" — a grid makes that intuitive
- Dense grid allows fine-grained control while maintaining structure
- Components automatically produce responsive, real-world layouts
- Simpler to implement and extend
- The AI can reason about grid placement more reliably than free-form coordinates

## Implementation Notes

- Grid should be fine-grained enough that users feel unrestricted
- Grid cells should be dynamic — resizable and mergeable
- Components should be able to span multiple grid cells
- **v1: absolute positioning within fixed canvas bounds. Responsive layouts deferred to v2.**
