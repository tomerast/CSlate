# Decision 015: Community Sharing is Opt-In (With Strong Nudge)

**Date:** 2026-03-28
**Status:** Accepted (Amended — replaces default-on sharing)

## Context

CSlate's core value proposition includes a self-improving community component library. Original design made sharing default-on. Critical review identified this as a GDPR risk: EU/California residents have the right not to have their data shared without explicit consent. Default-on is legally risky and potentially trust-damaging.

## Decision

**Community sharing is OPT-IN with a strong nudge at the right moment.**

Users must explicitly choose to share. The platform makes sharing easy and encourages it — but never assumes consent.

## Behavior

### The Sharing Nudge

After a user accepts a component, a non-blocking toast appears:

```
┌─────────────────────────────────────────────┐
│ ✓  Login Form saved                         │
│                                             │
│ Share with the CSlate community?            │
│ Help others build faster — it's free.       │
│                                             │
│  [Share]  [Not now]                         │
│                        ─── Don't ask again  │
└─────────────────────────────────────────────┘
```

**Rules:**
- Toast appears after first accept of any component session
- "Not now" = skip this component, ask again next session
- "Don't ask again" = suppress for this project (can re-enable in settings)
- "Share" = queue component for upload + review pipeline

### Opt-In Persistence

- Per-component: user selects share vs. keep private at accept time
- Per-project: project settings → "Contribution mode: Always share / Ask each time / Never share"
- Global: app settings → same three options
- Default: "Ask each time"

### Why Not Default-On

1. **GDPR Article 6**: Processing must have a lawful basis. Legitimate interests can work, but consent is cleaner for community sharing.
2. **User trust**: Non-technical users may not understand what "sharing a component" means. Surprising them erodes trust.
3. **Context.md risk**: Components include an AI-generated summary of the build conversation. Even a clean summary may contain user intent/context the user considers private.
4. **Reversibility**: Once shared and indexed, it's hard to fully retract. Default-on means users may share before they understand this.

### Why Still Valuable

- The nudge UI is prominent and appears at the high-engagement moment (component acceptance)
- "Share" is the primary CTA button (left-aligned, colored)
- Contribution mode in settings lets power users set "Always share" for zero friction
- Community library still grows — just from users who understand what they're sharing

### context.md: What Gets Shared

When a component is shared, `context.md` is uploaded as an **AI-generated summary** (not the raw conversation):

```
AI-generated clean summary:
"This Stock Ticker component was built to display real-time prices
for a configurable list of symbols using Yahoo Finance API. It
includes sparkline charts and auto-refreshes every 30 seconds."
```

The raw conversation is **never uploaded**. The AI generates this summary locally before upload. Users can review/edit the summary before confirming share.

### What Is Never Shared

- Raw AI conversation history
- `userConfig` values (symbols, API keys, credentials)
- Sensitive fields (`sensitive: true` in manifest)
- Local project structure (tab layouts, app config)
- Agent memories

### Flow

```
User accepts component
        |
        v
"Share with community?" toast (non-blocking)
        |
        ├── [Share] ──────────────────→ Generate context.md summary (local)
        │                                       |
        │                              Show preview + edit option
        │                                       |
        │                              Queue for upload + review
        │                                       |
        │                              7-stage review pipeline
        │                                       |
        │                              Approved → public in community DB
        │                              Rejected → stays private, user notified
        │
        ├── [Not now] ──→ Local only + cloud backup (private)
        │                 Ask again next session
        │
        └── [Don't ask again] ──→ Local only + cloud backup (private)
                                  Suppress nudge for this project
```

## Community Library Growth Strategy

Opt-in doesn't mean low contribution. Strategies to maximize sharing:

1. **Right-moment nudge** — ask immediately after accept (highest engagement)
2. **Social proof** — "127 users shared this week" in the toast
3. **Easy default** — "Contribution mode: Always share" for users who want it
4. **Reciprocity** — "You've used 12 community components. Share yours?"
5. **Low-friction review** — Summary is pre-generated, user just confirms
