# Decision 009: Floating AI Chat Interface

**Date:** 2026-03-28
**Status:** Accepted

## Context

Users interact with the AI agent through a floating interface triggered by a shortcut key. The interface must support both quick one-shot commands and multi-turn iterative refinement — the core CSlate loop.

## Decision

**Hybrid: Minimal command bar → expandable chat panel**

### Mode 1: Command Bar (Default)

Triggered by shortcut key (e.g., `Cmd+K` / `Ctrl+K`):

- Small, centered floating input field (like Spotlight/Raycast)
- Appears with a subtle animation (fade + slight scale)
- Semi-transparent backdrop dims the Slate slightly
- Auto-focus on the input
- Supports natural language: "add a login form", "make the header dark"
- Shows quick suggestions/recent commands below input
- Press `Escape` to dismiss
- Press `Enter` to submit

**When it stays as command bar:**
- Single-turn requests: "add a chart component"
- The AI processes, renders the component, and the command bar auto-dismisses
- A small toast/notification confirms what was done

### Mode 2: Chat Panel (Expanded)

Auto-expands when the conversation needs multiple turns:

- Slides in from the right side as a panel (doesn't cover the full Slate)
- Full conversation history visible
- Shows the component being discussed with a highlight on the Slate
- Supports rich content: code previews, component thumbnails, before/after
- User can type follow-up refinements naturally
- "Accept" button to finalize the component
- "Undo" to revert the last change
- Can be manually collapsed back to command bar mode

**Triggers for expansion:**
- AI asks a clarifying question ("What data should the table show?")
- User provides feedback on a rendered component ("make it wider")
- Component iteration begins (AI says "here's a first version, what do you think?")
- User explicitly requests chat mode

### Transition Between Modes

```
[Shortcut Key] → Command Bar (centered, minimal)
      |
      |--- Single-turn request → Process → Toast → Dismiss
      |
      |--- Multi-turn detected → Animate to Chat Panel (right side)
                |
                |--- Iterate on component
                |--- "Accept" → Finalize → Collapse
                |--- "Escape" / collapse button → Minimize to command bar
```

### Visual Design Principles

- **Non-intrusive:** Never covers the component being discussed
- **Contextual:** When discussing a specific component, the Slate highlights it
- **Responsive:** Panel width adapts to Slate size (never more than 30-40% of width)
- **Dark/light:** Follows the current Slate theme tokens
- **Accessible:** Keyboard-navigable, screen reader friendly

### Shortcut Key

- **Primary:** `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux)
  - Industry standard for command palettes (VS Code, Slack, Notion, Linear)
- **Secondary:** `Cmd+J` / `Ctrl+J` as alternative if user rebinds
- **Quick dismiss:** `Escape`
- **Quick accept:** `Cmd+Enter` / `Ctrl+Enter` to accept current component iteration

### Chat Panel Features

- **Conversation history** per Slate tab (each tab has its own chat context)
- **Component reference** — AI messages can reference specific components on the Slate
- **Inline previews** — Show small component thumbnails in chat messages
- **Action buttons** — "Accept", "Undo", "Try again", "Modify" inline in AI responses
- **Voice input** (future) — Microphone button for spoken requests
- **Slash commands** — `/search` (browse component DB), `/theme` (change theme), `/export` (export app)
