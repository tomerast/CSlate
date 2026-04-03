# Auto-Upload Default + Chat Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-upload baked components to the server after a 2-minute countdown with a "Keep private" escape hatch, and add ESC/Cmd+K controls to hide/restore the chat UI.

**Architecture:** Four focused file changes: chatStore gains a `'countdown'` publish state; useChat triggers it on writeComponent; PublishToast manages the timer and panel-close watcher; AppLayout gains a `chatVisible` flag gating all chat UI.

**Tech Stack:** React, Zustand, Vitest + @testing-library/react, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `src/renderer/store/chatStore.ts` | Update `publishState` union — add `'countdown'`, remove `'prompting'` and `'declined'` |
| `src/renderer/chat/useChat.ts` | Remove `setPublishState` on `renderComponent`; set `'countdown'` on `writeComponent` |
| `src/renderer/chat/PublishToast.tsx` | Rewrite: countdown timer, progress bar, Keep private button, panel-close watcher |
| `src/renderer/layout/AppLayout.tsx` | Add `chatVisible` state; ESC hides all; Cmd+K restores; gate renders |
| `src/renderer/__tests__/PublishToast.test.tsx` | New: tests for countdown, keep-private, panel-close cancel, auto-upload |
| `src/renderer/__tests__/AppLayout.test.tsx` | New: tests for ESC hide-all and Cmd+K restore |

---

### Task 1: Update publishState type in chatStore

**Files:**
- Modify: `src/renderer/store/chatStore.ts`

- [ ] **Step 1: Update the type union and reset value**

In `src/renderer/store/chatStore.ts`, replace lines 11 and 50:

```ts
// line 11 — was:
publishState: 'hidden' | 'prompting' | 'publishing' | 'published' | 'declined'
// becomes:
publishState: 'hidden' | 'countdown' | 'publishing' | 'published'
```

The `reset()` value at line 50 stays `'hidden'` — no change needed there.

Full updated file:

```ts
import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  panelOpen: boolean
  turnCount: number
  publishState: 'hidden' | 'countdown' | 'publishing' | 'published'
  statusLabel: string
  messageQueue: string[]
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setPanelOpen(v: boolean): void
  incrementTurnCount(): void
  setPublishState(s: ChatState['publishState']): void
  enqueueMessage(msg: string): void
  shiftQueue(): string | undefined
  reset(): void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  panelOpen: false,
  turnCount: 0,
  publishState: 'hidden',
  statusLabel: '',
  messageQueue: [],
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  incrementTurnCount: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  setPublishState: (publishState) => set({ publishState }),
  enqueueMessage: (msg) => set((s) => ({ messageQueue: [...s.messageQueue, msg] })),
  shiftQueue: () => {
    const { messageQueue } = get()
    if (messageQueue.length === 0) return undefined
    set({ messageQueue: messageQueue.slice(1) })
    return messageQueue[0]
  },
  reset: () => set({
    messages: [],
    status: 'idle',
    panelOpen: false,
    turnCount: 0,
    publishState: 'hidden',
    statusLabel: '',
    messageQueue: [],
  }),
}))
```

- [ ] **Step 2: Run typecheck to catch any callers of removed states**

```bash
npm run typecheck 2>&1 | grep -E "prompting|declined" | head -20
```

Expected: errors pointing at `useChat.ts` and `PublishToast.tsx` (both get fixed in later tasks). If other files appear, fix them now.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/store/chatStore.ts
git commit -m "refactor(store): replace prompting/declined publish states with countdown"
```

---

### Task 2: Update useChat.ts — trigger countdown on writeComponent only

**Files:**
- Modify: `src/renderer/chat/useChat.ts`

- [ ] **Step 1: Remove setPublishState from renderComponent branch, set countdown on writeComponent**

Find the block starting at line 112 in `src/renderer/chat/useChat.ts` and update it:

```ts
// was:
if (d.tool === 'renderComponent' && d.result?.success) {
  const { bundle, files, manifest, placement } = d.result
  if (bundle && files && manifest) {
    useCanvasStore.getState().setPreview({ bundle, files, manifest, placement })
    setPublishState('prompting')
  }
} else if (d.tool === 'writeComponent' && d.result?.success) {
  const { componentId, bundle, placement, manifest } = d.result
  if (componentId && bundle && placement && manifest) {
    useCanvasStore.getState().addComponent({ componentId, bundle, placement, manifest })
    useCanvasStore.getState().clearPreview()
    useCanvasStore.getState().removeBuildingCard(tabId)
    setPublishState('prompting')
  }
}

// becomes:
if (d.tool === 'renderComponent' && d.result?.success) {
  const { bundle, files, manifest, placement } = d.result
  if (bundle && files && manifest) {
    useCanvasStore.getState().setPreview({ bundle, files, manifest, placement })
  }
} else if (d.tool === 'writeComponent' && d.result?.success) {
  const { componentId, bundle, placement, manifest } = d.result
  if (componentId && bundle && placement && manifest) {
    useCanvasStore.getState().addComponent({ componentId, bundle, placement, manifest })
    useCanvasStore.getState().clearPreview()
    useCanvasStore.getState().removeBuildingCard(tabId)
    setPublishState('countdown')
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | grep useChat
```

Expected: no errors from useChat.ts.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/chat/useChat.ts
git commit -m "feat(chat): trigger countdown publish state on writeComponent, not renderComponent"
```

---

### Task 3: Rewrite PublishToast with countdown timer

**Files:**
- Modify: `src/renderer/chat/PublishToast.tsx`
- Create: `src/renderer/__tests__/PublishToast.test.tsx`

The toast has four render states:
- `'hidden'` / no preview manifest → renders nothing
- `'countdown'` → thin draining progress bar + "Keep private" button
- `'publishing'` → spinner + "Sharing…" text
- `'published'` → green "Shared!" confirmation (auto-hides after 3s)

The countdown logic:
- 120 000 ms timer; on expire → call `handleShare()`
- `useEffect` watching `panelOpen`: if it goes `false` while state is `'countdown'` → `setPublishState('hidden')`
- "Keep private" → `setPublishState('hidden')` (timer cleanup via useEffect return)

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/__tests__/PublishToast.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { PublishToast } from '../chat/PublishToast'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'

beforeEach(() => {
  vi.useFakeTimers()
  useChatStore.getState().reset()
  Object.defineProperty(window, 'electron', {
    value: { invoke: vi.fn().mockResolvedValue({}), on: vi.fn().mockReturnValue(() => {}), send: vi.fn() },
    writable: true, configurable: true,
  })
  // Set a preview manifest so the toast has data to work with
  useCanvasStore.getState().setPreview({
    bundle: 'bundle',
    files: { 'ui.tsx': 'export default () => null' },
    manifest: { name: 'TestComp', description: 'desc', tags: [] },
    placement: undefined,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PublishToast', () => {
  it('renders nothing when publishState is hidden', () => {
    useChatStore.getState().setPublishState('hidden')
    const { container } = render(<PublishToast />)
    expect(container.firstChild).toBeNull()
  })

  it('renders countdown toast with Keep private button when state is countdown', () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    expect(screen.getByText(/Keep private/i)).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('Keep private click cancels countdown and hides toast', () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    fireEvent.click(screen.getByText(/Keep private/i))
    expect(useChatStore.getState().publishState).toBe('hidden')
  })

  it('auto-uploads after 120s and transitions to publishing', async () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    expect(window.electron.invoke).toHaveBeenCalledWith('server:publish', expect.any(Object))
  })

  it('cancels countdown when panel closes', () => {
    useChatStore.getState().setPanelOpen(true)
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    act(() => {
      useChatStore.getState().setPanelOpen(false)
    })
    expect(useChatStore.getState().publishState).toBe('hidden')
  })

  it('does not cancel countdown when panel closes if state is not countdown', () => {
    useChatStore.getState().setPanelOpen(true)
    useChatStore.getState().setPublishState('publishing')
    render(<PublishToast />)
    act(() => {
      useChatStore.getState().setPanelOpen(false)
    })
    expect(useChatStore.getState().publishState).toBe('publishing')
  })

  it('shows Shared! after successful upload', async () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    await act(async () => {
      await Promise.resolve() // flush the invoke promise
    })
    expect(screen.getByText(/Shared!/i)).toBeTruthy()
  })

  it('hides Shared! after 3s', async () => {
    useChatStore.getState().setPublishState('published')
    render(<PublishToast />)
    expect(screen.getByText(/Shared!/i)).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    expect(useChatStore.getState().publishState).toBe('hidden')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/tomerast/Projects/CSlate/.worktrees/auto-upload-chat-visibility
npx vitest run src/renderer/__tests__/PublishToast.test.tsx 2>&1 | tail -20
```

Expected: multiple FAIL lines — `PublishToast` still has old `'prompting'` logic.

- [ ] **Step 3: Rewrite PublishToast.tsx**

Replace the entire file `src/renderer/chat/PublishToast.tsx`:

```tsx
import React, { useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'

const COUNTDOWN_MS = 120_000

export function PublishToast() {
  const publishState = useChatStore((s) => s.publishState)
  const setPublishState = useChatStore((s) => s.setPublishState)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const preview = useCanvasStore((s) => s.preview)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-upload after countdown expires
  useEffect(() => {
    if (publishState !== 'countdown') return
    timerRef.current = setTimeout(() => {
      handleShare()
    }, COUNTDOWN_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [publishState])

  // Cancel countdown when panel closes
  useEffect(() => {
    if (!panelOpen && publishState === 'countdown') {
      if (timerRef.current) clearTimeout(timerRef.current)
      setPublishState('hidden')
    }
  }, [panelOpen])

  // Auto-hide after published
  useEffect(() => {
    if (publishState !== 'published') return
    const timer = setTimeout(() => setPublishState('hidden'), 3000)
    return () => clearTimeout(timer)
  }, [publishState])

  async function handleShare() {
    setPublishState('publishing')
    try {
      const manifest = preview?.manifest as Record<string, unknown> | undefined
      await window.electron.invoke('server:publish', {
        name: (manifest?.name as string) ?? 'Untitled Component',
        description: (manifest?.description as string) ?? 'A CSlate component',
        tags: (manifest?.tags as string[]) ?? [],
        source: preview?.files ?? {},
        manifest: preview?.manifest,
      })
      setPublishState('published')
    } catch {
      setPublishState('hidden')
    }
  }

  function handleKeepPrivate() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPublishState('hidden')
  }

  if (publishState === 'hidden' || !preview?.manifest) return null

  if (publishState === 'published') {
    return (
      <div className="mx-3 mb-2 p-3 bg-success/10 border border-success/30 rounded-md">
        <div className="flex items-center gap-2 text-sm text-success">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>Shared! Your component is being reviewed.</span>
        </div>
      </div>
    )
  }

  if (publishState === 'publishing') {
    return (
      <div className="mx-3 mb-2 p-3 bg-surface border border-border rounded-md">
        <div className="flex items-center gap-2 text-sm text-text">
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Sharing...</span>
        </div>
      </div>
    )
  }

  // publishState === 'countdown'
  return (
    <div className="mx-3 mb-2 bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-sm text-text">Sharing with community…</span>
        <button
          onClick={handleKeepPrivate}
          className="px-3 py-1 text-xs text-muted hover:text-text border border-border rounded-md transition-colors flex-shrink-0"
        >
          Keep private
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Sharing countdown"
        className="h-0.5 bg-primary/40 origin-left"
        style={{
          animation: `shrink ${COUNTDOWN_MS}ms linear forwards`,
        }}
      />
      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/renderer/__tests__/PublishToast.test.tsx 2>&1 | tail -20
```

Expected: all 8 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test 2>&1 | tail -10
```

Expected: 367+ tests passing, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/chat/PublishToast.tsx src/renderer/__tests__/PublishToast.test.tsx
git commit -m "feat(publish): auto-upload after 2-min countdown with Keep private escape hatch"
```

---

### Task 4: Add chat visibility controls to AppLayout

**Files:**
- Modify: `src/renderer/layout/AppLayout.tsx`
- Create: `src/renderer/__tests__/AppLayout.test.tsx`

New behaviour:
- `chatVisible` state (default `true`) gates FloatingChatBar, ChatPanel, and the trigger pill
- ESC: `setCmdBarOpen(false)` + `setPanelOpen(false)` + `setChatVisible(false)`
- `Cmd+K`: if `!chatVisible` → `setChatVisible(true)` + `setCmdBarOpen(true)`; else toggle `cmdBarOpen` (unchanged)

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/__tests__/AppLayout.test.tsx`:

```tsx
import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { AppLayout } from '../layout/AppLayout'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'

beforeEach(() => {
  useChatStore.getState().reset()
  useCanvasStore.getState().clearPreview()
  Object.defineProperty(window, 'electron', {
    value: {
      invoke: vi.fn().mockResolvedValue(null),
      on: vi.fn().mockReturnValue(() => {}),
      send: vi.fn(),
      platform: 'darwin',
      isDev: false,
    },
    writable: true, configurable: true,
  })
})

describe('AppLayout chat visibility', () => {
  it('ESC hides the chat UI (chatVisible becomes false)', () => {
    const { queryByTitle } = render(<AppLayout />)
    // Initially the trigger button is visible (no messages, panel closed)
    expect(queryByTitle(/Ask anything/i)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(queryByTitle(/Ask anything/i)).toBeNull()
  })

  it('Cmd+K after ESC restores and opens chat bar', () => {
    const { queryByTitle } = render(<AppLayout />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(queryByTitle(/Ask anything/i)).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(queryByTitle(/Ask anything/i)).toBeTruthy()
  })

  it('ESC also closes an open panel', () => {
    useChatStore.getState().setPanelOpen(true)
    render(<AppLayout />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useChatStore.getState().panelOpen).toBe(false)
  })

  it('Cmd+K toggles cmdBarOpen when already visible', () => {
    // After Cmd+K the FloatingChatBar input should be present
    const { queryByPlaceholderText } = render(<AppLayout />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(queryByPlaceholderText(/Ask anything/i)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(queryByPlaceholderText(/Ask anything/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/renderer/__tests__/AppLayout.test.tsx 2>&1 | tail -20
```

Expected: FAIL — ESC currently only closes cmdBarOpen, chatVisible doesn't exist yet.

- [ ] **Step 3: Update AppLayout.tsx**

Replace the full file `src/renderer/layout/AppLayout.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore, type CanvasComponent } from '../store/canvasStore'
import { usePipelineStore } from '../store/pipelineStore'
import { useChat } from '../chat/useChat'
import { FloatingChatBar } from '../chat/FloatingChatBar'
import { ChatPanel } from '../chat/ChatPanel'
import { SlateCanvas } from '../canvas/SlateCanvas'

interface AppLayoutProps {
  onOpenConfig?: () => void
}

export function AppLayout({ onOpenConfig }: AppLayoutProps) {
  const [cmdBarOpen, setCmdBarOpen] = useState(false)
  const [chatVisible, setChatVisible] = useState(true)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const setPanelOpen = useChatStore((s) => s.setPanelOpen)
  const messages = useChatStore((s) => s.messages)
  const { submit } = useChat()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (!chatVisible) {
          setChatVisible(true)
          setCmdBarOpen(true)
        } else {
          setCmdBarOpen((v) => !v)
        }
      }
      if (e.key === 'Escape') {
        setCmdBarOpen(false)
        setPanelOpen(false)
        setChatVisible(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [chatVisible, setPanelOpen])

  useEffect(() => {
    window.electron.invoke('canvas:load', { projectDir: '' }).then((result: unknown) => {
      const r = result as { components?: CanvasComponent[] } | null
      if (Array.isArray(r?.components) && r.components.length > 0) {
        useCanvasStore.getState().hydrate(r.components)
      }
    }).catch(() => {})

    window.electron.invoke('pipeline:list').then((pipelines: unknown) => {
      if (Array.isArray(pipelines)) {
        usePipelineStore.getState().hydrate(pipelines as any)
      }
    }).catch(() => {})

    const removeStatusListener = window.electron.on('pipeline:status-change', (msg: unknown) => {
      const { pipelineId, status } = msg as { pipelineId: string; status: any }
      usePipelineStore.getState().updateRuntimeStatus(pipelineId, status)
    })

    return () => { removeStatusListener() }
  }, [])

  const handleSubmit = useCallback(async (text: string) => {
    setCmdBarOpen(false)
    await submit(text)
  }, [submit])

  const showTriggerButton = messages.length === 0 && !panelOpen && !cmdBarOpen

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="h-8 flex-shrink-0 app-drag-region relative">
        <button
          onClick={onOpenConfig}
          title="Settings (⌘,)"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted/50 hover:text-muted transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <SlateCanvas />
        {chatVisible && panelOpen && (
          <ChatPanel
            onSubmit={handleSubmit}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {chatVisible && showTriggerButton && (
        <button
          onClick={() => setCmdBarOpen(true)}
          title="Ask anything (⌘K)"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-10 h-10 bg-surface border border-border rounded-full flex items-center justify-center text-muted/40 hover:text-primary/70 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.18)] transition-all duration-200 shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </button>
      )}

      {chatVisible && (
        <FloatingChatBar
          open={cmdBarOpen}
          nudgeDismissed={nudgeDismissed}
          onSubmit={handleSubmit}
          onDismiss={() => setCmdBarOpen(false)}
          onOpenPanel={() => setPanelOpen(true)}
          onDismissNudge={() => setNudgeDismissed(true)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run AppLayout tests**

```bash
npx vitest run src/renderer/__tests__/AppLayout.test.tsx 2>&1 | tail -20
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass (previous FloatingChatBar tests still pass).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/layout/AppLayout.tsx src/renderer/__tests__/AppLayout.test.tsx
git commit -m "feat(layout): ESC hides chat UI, Cmd+K restores — chatVisible flag gates all chat elements"
```

---

### Task 5: Final typecheck + full test run

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck 2>&1
```

Expected: no errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 3: Commit if anything was fixed**

If typecheck or tests revealed minor issues fixed in this step:

```bash
git add -p
git commit -m "fix: resolve typecheck errors from publish state refactor"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| No toast on renderComponent | Task 2 |
| Auto-upload on writeComponent after 120s | Task 3 |
| "Keep private" button cancels countdown | Task 3 |
| Closing panel cancels countdown | Task 3 |
| Upload error → hidden (silent) | Task 3 |
| "Shared!" confirmation → auto-hides after 3s | Task 3 |
| ESC hides pill + panel + bar | Task 4 |
| Cmd+K restores + opens chat | Task 4 |
| chatVisible gates all chat UI | Task 4 |

All requirements covered. No gaps.

**Type consistency check:** `publishState` union defined in Task 1 (`'hidden' \| 'countdown' \| 'publishing' \| 'published'`). All usages in Tasks 2, 3, 4 use only values from this union. `setPublishState('countdown')` in Task 2 matches; `setPublishState('hidden')` in Task 3 matches; store `reset()` sets `'hidden'` — consistent.

**Placeholder scan:** No TBDs, no "implement later", all code steps are complete.
