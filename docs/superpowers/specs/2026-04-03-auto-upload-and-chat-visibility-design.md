# Auto-Upload Default + Chat Visibility Controls

**Date:** 2026-04-03  
**Status:** Approved

---

## Overview

Two related features:

1. **Auto-upload default** — when the agent writes a component to disk, automatically upload it to the CSlate server after a 2-minute countdown. User can cancel by clicking "Keep private" or by closing the chat panel.
2. **Chat visibility controls** — ESC hides both the floating chat bar (pill) and the chat panel. `Cmd+K` restores and opens the chat.

---

## Feature 1: Auto-Upload with "Keep Private" Countdown

### Behaviour

- `renderComponent` tool success → **no toast, no upload trigger** (component is preview-only, not baked)
- `writeComponent` tool success → start 120s countdown, set `publishState` to `'countdown'`
- During countdown: `PublishToast` shows a thin progress bar draining over 120s and a "Keep private" button
- After 120s with no action: upload fires (`server:publish` IPC), state → `'publishing'` → `'published'`
- `'published'` state: toast shows "Shared!" for 3s, then hides
- "Keep private" clicked: countdown cancelled, state → `'hidden'`, toast disappears silently
- Chat panel closed (panelOpen → false while state is `'countdown'`): treated as "Keep private" — countdown cancelled, state → `'hidden'`
- Upload error: state reverts to `'hidden'` (silent failure — catalog upload is non-critical)

### State machine

```
hidden → countdown → publishing → published → hidden
              ↓
           hidden   (keep private or panel close)
```

New state added: `'countdown'`. State `'prompting'` and `'declined'` removed (no longer needed).

### Changes

**`src/renderer/store/chatStore.ts`**
- `publishState` type: `'hidden' | 'countdown' | 'publishing' | 'published'`

**`src/renderer/chat/useChat.ts`**
- `renderComponent` branch: remove `setPublishState('prompting')` — no action
- `writeComponent` branch: change `setPublishState('prompting')` → `setPublishState('countdown')`

**`src/renderer/chat/PublishToast.tsx`**
- Remove `'prompting'` and `'declined'` render branches
- Add `'countdown'` branch: thin progress bar (CSS animation, 120s linear), "Keep private" button
  - `useEffect` with 120s `setTimeout`: on expire → call `handleShare()` (existing upload logic)
  - `useEffect` watching `panelOpen` from `chatStore`: if `panelOpen` becomes `false` and state is `'countdown'` → `setPublishState('hidden')`
  - "Keep private" onClick → `setPublishState('hidden')` (clears the timer via cleanup)
- Upload error handler: `setPublishState('hidden')` instead of reverting to `'prompting'`

---

## Feature 2: Chat Visibility Controls

### Behaviour

- **ESC**: hides everything — closes FloatingChatBar, closes ChatPanel, hides the trigger pill. A single `chatVisible` flag tracks this.
- **`Cmd+K`**: if `chatVisible` is false → set `chatVisible = true` and open FloatingChatBar. If `chatVisible` is true → toggle FloatingChatBar open/closed (existing behaviour).
- **Panel close button**: closes panel only, does not hide pill/bar (existing behaviour, no change).
- `chatVisible` defaults to `true`.

### Why local state, not store

`chatVisible` is pure UI visibility with no cross-component dependencies beyond `AppLayout`. It lives in `AppLayout` as `useState`. No store change needed.

### Changes

**`src/renderer/layout/AppLayout.tsx`**
- Add `const [chatVisible, setChatVisible] = useState(true)`
- Update `keydown` handler:
  - `Escape`: `setCmdBarOpen(false)` + `setPanelOpen(false)` + `setChatVisible(false)`
  - `Cmd+K`: if `!chatVisible` → `setChatVisible(true)` + `setCmdBarOpen(true)`; else toggle `cmdBarOpen` (existing)
- Render: gate `FloatingChatBar`, `ChatPanel`, and the trigger pill on `chatVisible`
  - `{chatVisible && <FloatingChatBar ... />}`
  - `{chatVisible && panelOpen && <ChatPanel ... />}`
  - `{chatVisible && showTriggerButton && <button .../>}`

---

## Non-goals

- No "Keep private" setting in the config panel (overkill for now)
- No delete-from-server capability (upload is one-way; countdown window is the only opt-out)
- No visual countdown timer text (progress bar is sufficient)

---

## Files to touch

| File | Change |
|------|--------|
| `src/renderer/store/chatStore.ts` | Update `publishState` union type |
| `src/renderer/chat/useChat.ts` | Remove `prompting` on `renderComponent`, set `countdown` on `writeComponent` |
| `src/renderer/chat/PublishToast.tsx` | Rewrite render logic for new states, add countdown timer + panel-close watcher |
| `src/renderer/layout/AppLayout.tsx` | Add `chatVisible` state, update keydown handler, gate renders |
