# Pill Chat UX Design

**Date:** 2026-03-31
**Status:** Approved
**Scope:** Interactive loop UX redesign — pill-first interaction + chat panel visual refresh

---

## Problem

The current chat panel is a fixed 360px right-side panel that opens alongside the canvas. It is visually heavy (ugly styling), occupies permanent screen real estate, and is the only interaction surface. Most interactions are short and don't need a full chat panel.

---

## Goal

Make the default interaction lightweight and canvas-first using short message pills. Reserve the full chat panel for dense, multi-turn conversations. Also redesign the chat panel to be visually clean.

---

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `src/renderer/chat/CommandBar.tsx` | Refactor → `FloatingChatBar.tsx` (remove modal, make bottom-anchored) |
| `src/renderer/layout/AppLayout.tsx` | Add `FloatingTriggerButton`, wire up `cmdBarOpen` |
| `src/renderer/chat/ChatPanel.tsx` | Styles only — no logic changes |
| `src/renderer/chat/MessageList.tsx` | Styles only — no logic changes |
| `src/renderer/store/chatStore.ts` | Add `turnCount: number` field |

### What Does NOT Change

- `useChat.ts` — agent submission logic is untouched
- `SlateCanvas.tsx` — untouched
- All IPC / Electron agent code — untouched
- `panelOpen` toggle behavior — unchanged

---

## FloatingChatBar

Refactored from `CommandBar`. Loses modal backdrop. Becomes a fixed bottom-center floating card above the canvas (`z-50`, `bottom: 24px`, `left: 50%`, `translateX(-50%)`).

### States

**State 1 — Input mode**
- Triggered by: `FloatingTriggerButton` click OR Cmd+K
- Pill-shaped input bar, ~480px wide, centered
- Placeholder: `"Ask anything (⌘K)"`
- Escape closes, returns to trigger button
- Submit transitions to Exchange mode

**State 2 — Exchange mode**
- Shows after agent responds
- User message: small compact pill, right-aligned, dark gray (`bg-[#2a2a2a]`), truncated at 80 chars
- Agent response: slightly wider card, left-aligned, plain text, truncated at 300 chars with fade
- Small follow-up input bar remains below for continued conversation
- Density nudge appears when either density trigger fires

**State 3 — Density nudge** (overlays Exchange mode)
- Triggered when: agent response > 300 chars OR `turnCount >= 5`
- Shows subtle text link: `"Conversation getting long — Open full chat →"`
- Clicking opens `ChatPanel` and hides `FloatingChatBar` (while panel is open)
- When `ChatPanel` is closed, `FloatingChatBar` resumes in Exchange mode
- User can dismiss nudge and stay in pill mode

### FloatingTriggerButton

- Small circle with chat bubble icon
- Position: `bottom: 24px`, horizontally centered in canvas area
- Visible only when `messages.length === 0`
- Hidden once conversation starts (Exchange mode replaces it)
- Hidden when `panelOpen === true`

### Density Triggers

| Trigger | Condition |
|---------|-----------|
| Long response | Latest agent message > 300 characters |
| Turn count | `turnCount >= 5` |

`turnCount` is incremented in `chatStore` on each completed exchange (user + agent pair).

---

## ChatPanel Redesign

Styling only — no structural or logic changes.

### Overall Panel
- Background: `bg-[#0d0d0d]`
- No visible panel border
- Minimal header — close button only, top-right

### User Messages
- Pill shape: `rounded-full bg-[#2a2a2a] px-3 py-1.5 text-sm text-[#aaaaaa]`
- Right-aligned, max-width 60% of panel
- No timestamp, no avatar

### Agent Messages
- No bubble — rendered markdown on dark background (bold, italics, lists, code blocks)
- Use `react-markdown` to render agent message content — replaces raw `<p>` text rendering
- Full width with right padding
- Text: `text-sm leading-relaxed text-[#e0e0e0]`
- Below each message: subtle muted action row — copy, thumbs up, thumbs down icons (`text-[#555]`, `gap-3`)

### Markdown Rendering
- Agent messages in both `FloatingChatBar` and `ChatPanel` must render via `react-markdown`
- User messages remain plain text (pills — no markdown needed)
- Code blocks: monospace, `bg-[#1a1a1a]` background, subtle border
- Inline code: `bg-[#1a1a1a] rounded px-1`
- Lists: standard `ul`/`ol` with left padding

### Input Bar
- Pill-shaped, full-width: `rounded-full bg-[#1a1a1a] border border-[#2a2a2a]`
- Placeholder: `"Ask anything (⌘K)"`
- Bottom toolbar: `</>` (code mode toggle, future), model name label (display only), send button — all small and muted. `+` and mic are decorative placeholders for visual polish, not wired up.

### Typography
- Agent text: `text-sm leading-relaxed text-[#e0e0e0]`
- User pill text: `text-sm text-[#aaaaaa]`
- Muted UI elements: `text-[#555]`

---

## Interaction Flow

```
Canvas idle
  └─ FloatingTriggerButton visible (bottom-center)
       │
       ▼ click or Cmd+K
  FloatingChatBar — Input mode
       │
       ▼ submit
  FloatingChatBar — Exchange mode
  (user pill + agent pill + follow-up input)
       │
       ├─ turnCount >= 5 OR response > 300 chars
       │    └─ Density nudge: "Open full chat →"
       │         └─ click → ChatPanel opens, FloatingChatBar hides
       │
       └─ user dismisses nudge → stays in pill mode
```

---

## Out of Scope

- Agent streaming / IPC changes
- Publish toast changes
- Canvas rendering changes
- Any new features beyond pill mode + chat panel restyle
