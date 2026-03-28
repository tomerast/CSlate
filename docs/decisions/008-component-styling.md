# Decision 008: Component Styling Approach

**Date:** 2026-03-28
**Status:** Accepted

## Context

AI-generated components need a consistent styling approach that:
- AI can generate reliably
- Works inside the sandbox iframe
- Produces visually cohesive results when community components from different users are combined on one Slate

## Options Evaluated

| Option | AI Reliability | Scoping | Runtime Cost | Cohesion |
|---|---|---|---|---|
| Tailwind CSS | Excellent | By design | None | Low (no shared tokens) |
| CSS Modules | Good | Excellent | None | Low |
| CSS-in-JS (styled-components) | Good | Excellent | High (runtime) | Low |
| **Tailwind + Design Tokens** | **Excellent** | **By design** | **None** | **High** |

## Decision

**Tailwind CSS + CSlate Design Token System**

### Why Tailwind as the Base
- AI generates Tailwind with the highest reliability (massive training data)
- Utility-first = styles live in markup = one file per component (simpler for AI + sandbox)
- No runtime CSS-in-JS overhead inside the sandbox
- Purging unused styles keeps bundle small
- Built-in responsive design utilities match our grid layout

### Why Design Tokens on Top
- Components from different users/AI sessions need to look cohesive on the same Slate
- Design tokens create a shared visual language: colors, spacing, typography, radii, shadows
- Users can theme their entire Slate by changing tokens (dark mode, brand colors, etc.)
- Community components automatically adapt to the current Slate's theme

### Design Token System

Tokens are defined as CSS custom properties and mapped to Tailwind's config:

```typescript
interface SlateTheme {
  colors: {
    primary: string;        // --slate-primary
    secondary: string;      // --slate-secondary
    accent: string;         // --slate-accent
    background: string;     // --slate-bg
    surface: string;        // --slate-surface
    text: string;           // --slate-text
    textMuted: string;      // --slate-text-muted
    border: string;         // --slate-border
    error: string;          // --slate-error
    success: string;        // --slate-success
    warning: string;        // --slate-warning
  };
  spacing: {
    unit: number;           // Base spacing unit (default: 4px)
  };
  typography: {
    fontFamily: string;     // --slate-font
    fontFamilyMono: string; // --slate-font-mono
    scale: number;          // Type scale ratio (default: 1.25)
  };
  radius: {
    sm: string;             // --slate-radius-sm
    md: string;             // --slate-radius-md
    lg: string;             // --slate-radius-lg
    full: string;           // --slate-radius-full
  };
  shadows: {
    sm: string;             // --slate-shadow-sm
    md: string;             // --slate-shadow-md
    lg: string;             // --slate-shadow-lg
  };
}
```

### How It Works in Practice

1. **Tailwind config extends with token references:**
   ```js
   // tailwind.config.js (inside sandbox iframe)
   colors: {
     primary: 'var(--slate-primary)',
     secondary: 'var(--slate-secondary)',
     // ...
   }
   ```

2. **AI generates components using semantic token classes:**
   ```jsx
   <button className="bg-primary text-white rounded-md px-4 py-2 shadow-sm">
     Add Item
   </button>
   ```

3. **Host injects theme CSS variables into sandbox iframe:**
   ```css
   :root {
     --slate-primary: #3b82f6;
     --slate-bg: #ffffff;
     /* ... */
   }
   ```

4. **User changes theme → all components update instantly** (CSS variables cascade)

### AI Generation Rules

The agent's component-builder skill includes these styling rules:
- Always use Tailwind utility classes
- Use semantic token colors (`bg-primary`, `text-muted`) not raw colors (`bg-blue-500`)
- Use token radii (`rounded-md`) and shadows (`shadow-sm`) for consistency
- Use the spacing scale (`p-4`, `gap-3`) not arbitrary values
- No responsive breakpoints in v1 (canvas uses absolute positioning). Components fill their fixed grid slot.

### Token Enforcement

AI-generated components must use semantic tokens, not raw Tailwind color/spacing utilities. We enforce this at multiple layers:

1. **Post-generation lint (client-side):** After the LLM generates component code, a static regex pass flags hardcoded colors like `bg-blue-500`, `text-gray-900`, `border-red-400`. The agent is instructed to fix violations before rendering.

2. **Server hard reject:** The server review pipeline (stage: quality_review) rejects components that use raw color utilities. Rejected components are NOT cataloged. The rejection reason is returned to the client so the user can regenerate.

3. **Runtime fallback:** If a component somehow renders with unmapped token classes, the CSS variable resolves to a sensible default (not broken). The sandbox iframe's Tailwind config maps all `bg-primary`, `text-muted` etc. to CSS variables with fallback values.

**Enforcement priority:** Server rejection is the hard gate. Client lint is the early warning. Runtime fallback is the safety net.

### Theming for Users

Users can:
- Pick from preset themes (Light, Dark, Midnight, Forest, etc.)
- Customize individual tokens via the AI ("make the primary color warmer")
- Import brand colors
- Toggle dark/light mode (swaps the full token set)

### Community Component Compatibility

Because all components use semantic tokens (not hardcoded colors):
- A component built with a blue theme works in a green theme
- Dark mode is automatic — swap the token CSS variables
- Visual cohesion across components from different authors
- The manifest can declare if a component has special theme requirements
