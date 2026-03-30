# Pill Chat UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CommandBar modal with a bottom-anchored pill overlay for lightweight agent interaction, with automatic density detection to suggest the full chat panel, and restyle the chat panel to a clean dark design with markdown rendering.

**Architecture:** `CommandBar` is replaced by `FloatingChatBar` — a fixed bottom-center overlay with three visual states (input, exchange, density nudge). `AppLayout` gains a `FloatingTriggerButton` that initiates conversations. `MessageList` and `ChatPanel` are restyled with `react-markdown` for agent messages.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, react-markdown v8, Vitest + @testing-library/react

**Worktree:** `/Users/tomerast/Projects/CSlate/.worktrees/feature/pill-chat-ux`
**All commands run from worktree root.**

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/chat/FloatingChatBar.tsx` | **Create** | Replaces CommandBar; handles input/exchange/nudge states |
| `src/renderer/chat/CommandBar.tsx` | **Delete** | Replaced by FloatingChatBar |
| `src/renderer/store/chatStore.ts` | **Modify** | Add `turnCount`, `incrementTurnCount()` |
| `src/renderer/chat/useChat.ts` | **Modify** | Remove auto-open panel; call `incrementTurnCount()` after each exchange |
| `src/renderer/layout/AppLayout.tsx` | **Modify** | Use FloatingChatBar + FloatingTriggerButton; remove CommandBar |
| `src/renderer/chat/MessageList.tsx` | **Modify** | React-markdown for agent messages; pill styling for user messages |
| `src/renderer/chat/ChatPanel.tsx` | **Modify** | Dark restyle; pill-shaped input; minimal header |
| `src/renderer/__tests__/FloatingChatBar.test.tsx` | **Create** | Tests for FloatingChatBar states |
| `src/renderer/__tests__/chatStore.test.ts` | **Create** | Tests for turnCount |
| `src/renderer/__tests__/useChat.test.ts` | **Modify** | Update panelOpen assertion (no longer auto-opened) |

---

## Task 1: Install react-markdown

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install react-markdown@8
```

Expected output ends with: `added N packages`

- [ ] **Step 2: Verify TypeScript types are available**

```bash
npx tsc --noEmit 2>&1 | head -5
```

Expected: no `react-markdown` related errors (types are bundled in v8)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown dependency"
```

---

## Task 2: Add `turnCount` to chatStore

**Files:**
- Modify: `src/renderer/store/chatStore.ts`
- Create: `src/renderer/__tests__/chatStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/__tests__/chatStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '../store/chatStore'

describe('chatStore turnCount', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('starts at 0', () => {
    expect(useChatStore.getState().turnCount).toBe(0)
  })

  it('increments by 1 on each call', () => {
    useChatStore.getState().incrementTurnCount()
    expect(useChatStore.getState().turnCount).toBe(1)
    useChatStore.getState().incrementTurnCount()
    expect(useChatStore.getState().turnCount).toBe(2)
  })

  it('resets to 0 on reset()', () => {
    useChatStore.getState().incrementTurnCount()
    useChatStore.getState().incrementTurnCount()
    useChatStore.getState().reset()
    expect(useChatStore.getState().turnCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/renderer/__tests__/chatStore.test.ts 2>&1 | tail -10
```

Expected: FAIL — `incrementTurnCount is not a function`

- [ ] **Step 3: Update chatStore**

Replace `src/renderer/store/chatStore.ts` with:

```typescript
import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  currentCode: string | null
  panelOpen: boolean
  turnCount: number
  publishState: 'hidden' | 'prompting' | 'publishing' | 'published' | 'declined'
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setCurrentCode(code: string | null): void
  setPanelOpen(v: boolean): void
  incrementTurnCount(): void
  setPublishState(s: ChatState['publishState']): void
  reset(): void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  status: 'idle',
  currentCode: null,
  panelOpen: false,
  turnCount: 0,
  publishState: 'hidden',
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setCurrentCode: (code) => set({ currentCode: code }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  incrementTurnCount: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  setPublishState: (s) => set({ publishState: s }),
  reset: () => set({
    messages: [],
    status: 'idle',
    currentCode: null,
    panelOpen: false,
    turnCount: 0,
    publishState: 'hidden',
  }),
}))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/renderer/__tests__/chatStore.test.ts 2>&1 | tail -10
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/chatStore.ts src/renderer/__tests__/chatStore.test.ts
git commit -m "feat: add turnCount to chatStore"
```

---

## Task 3: Update `useChat` — remove auto-panel-open, add `incrementTurnCount`

The agent flow currently calls `setPanelOpen(true)` on every submit. In the new design, the FloatingChatBar shows automatically when messages exist — no need to force the panel open. We also track turn count after each successful exchange.

**Files:**
- Modify: `src/renderer/chat/useChat.ts`
- Modify: `src/renderer/__tests__/useChat.test.ts`

- [ ] **Step 1: Update `useChat.ts`**

Replace `src/renderer/chat/useChat.ts` with:

```typescript
import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'

const MAX_HISTORY_MESSAGES = 6

export function useChat() {
  const { addMessage, setStatus, setCurrentCode, setPublishState, incrementTurnCount } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // Capture history BEFORE adding user message to avoid double-sending
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPublishState('hidden')

    // Buffer streaming tokens into a single assistant message
    let streamedContent = ''
    let streamMessageAdded = false

    const offToken = window.electron.on('agent:token', (data: unknown) => {
      const d = data as { delta: string }
      streamedContent += d.delta
      if (!streamMessageAdded) {
        addMessage({ role: 'assistant', content: streamedContent })
        streamMessageAdded = true
      } else {
        // Update the last message in-place
        useChatStore.setState(s => {
          const messages = [...s.messages]
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: streamedContent }
          }
          return { messages }
        })
      }
    })

    // Track code from renderComponent tool calls so we can trigger the publish toast
    let pendingCode: string | null = null
    const offToolCall = window.electron.on('agent:tool-call', (data: unknown) => {
      const d = data as { tool: string; input: { files?: { 'ui.tsx'?: string } } }
      if (d.tool === 'renderComponent' && d.input?.files?.['ui.tsx']) {
        pendingCode = d.input.files['ui.tsx']
      }
    })
    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as { tool: string; result: { success?: boolean } }
      if (d.tool === 'renderComponent' && d.result?.success && pendingCode) {
        setCurrentCode(pendingCode)
        setPublishState('prompting')
        pendingCode = null
      }
    })
    const offError = window.electron.on('agent:error', (data: unknown) => {
      const d = data as { message: string; code?: string }
      if (d.code === 'UNCONFIGURED_LLM') {
        useAppStore.getState().openConfig('models')
        setStatus('idle')
        addMessage({
          role: 'assistant',
          content: "No AI provider configured — I've opened Settings so you can set one up."
        })
      } else {
        setStatus('error')
        addMessage({ role: 'assistant', content: `Error: ${d.message}` })
      }
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir: '',
        tabId: crypto.randomUUID(),
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })
      setStatus('idle')
      incrementTurnCount()
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offToolCall()
      offToolResult()
      offError()
    }
  }, [addMessage, setStatus, setCurrentCode, setPublishState, incrementTurnCount])

  return { submit }
}
```

Key changes: removed `setPanelOpen(true)`, removed `setPanelOpen` from destructuring, added `incrementTurnCount` call after `setStatus('idle')`.

- [ ] **Step 2: Update the `panelOpen` test in `useChat.test.ts`**

In `src/renderer/__tests__/useChat.test.ts`, find and replace the `panelOpen` test:

Old test (lines ~163–171):
```typescript
it('should set panelOpen to true on submit', async () => {
  const { result } = renderHook(() => useChat())

  expect(useChatStore.getState().panelOpen).toBe(false)

  await result.current.submit('Test')

  expect(useChatStore.getState().panelOpen).toBe(true)
})
```

Replace with:
```typescript
it('should NOT auto-open the panel on submit (FloatingChatBar handles visibility)', async () => {
  const { result } = renderHook(() => useChat())

  expect(useChatStore.getState().panelOpen).toBe(false)

  await result.current.submit('Test')

  expect(useChatStore.getState().panelOpen).toBe(false)
})
```

- [ ] **Step 3: Add turnCount test to `useChat.test.ts`**

Add this test inside the `describe('basic submit functionality')` block:

```typescript
it('should increment turnCount after successful exchange', async () => {
  const { result } = renderHook(() => useChat())

  expect(useChatStore.getState().turnCount).toBe(0)

  await result.current.submit('Test')

  await waitFor(() => {
    expect(useChatStore.getState().turnCount).toBe(1)
  })
})
```

- [ ] **Step 4: Run all useChat tests**

```bash
npx vitest run src/renderer/__tests__/useChat.test.ts 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/chat/useChat.ts src/renderer/__tests__/useChat.test.ts
git commit -m "feat: remove auto-panel-open, increment turnCount after exchange"
```

---

## Task 4: Create `FloatingChatBar`

**Files:**
- Create: `src/renderer/chat/FloatingChatBar.tsx`
- Create: `src/renderer/__tests__/FloatingChatBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/__tests__/FloatingChatBar.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { FloatingChatBar } from '../chat/FloatingChatBar'
import { useChatStore } from '../store/chatStore'

beforeEach(() => {
  useChatStore.getState().reset()
  Object.defineProperty(window, 'electron', {
    value: { invoke: vi.fn(), on: vi.fn().mockReturnValue(() => {}), send: vi.fn(), platform: 'darwin', isDev: false },
    writable: true, configurable: true,
  })
})

const defaultProps = {
  open: false,
  onSubmit: vi.fn(),
  onDismiss: vi.fn(),
  onOpenPanel: vi.fn(),
}

describe('FloatingChatBar', () => {
  it('renders nothing when open=false and no messages', () => {
    const { container } = render(<FloatingChatBar {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders input bar when open=true and no messages', () => {
    render(<FloatingChatBar {...defaultProps} open={true} />)
    expect(screen.getByPlaceholderText('Ask anything (⌘K)')).toBeTruthy()
  })

  it('calls onSubmit with trimmed text on Enter', () => {
    const onSubmit = vi.fn()
    render(<FloatingChatBar {...defaultProps} open={true} onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText('Ask anything (⌘K)')
    fireEvent.change(input, { target: { value: '  hello world  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('hello world')
  })

  it('calls onDismiss on Escape when no messages', () => {
    const onDismiss = vi.fn()
    render(<FloatingChatBar {...defaultProps} open={true} onDismiss={onDismiss} />)
    const input = screen.getByPlaceholderText('Ask anything (⌘K)')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('shows user pill and agent response when messages exist', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'Hello' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'Hi there!' })
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText('Hello')).toBeTruthy()
    expect(screen.getByText(/Hi there!/)).toBeTruthy()
  })

  it('truncates user message to 80 chars', () => {
    const longMsg = 'a'.repeat(100)
    useChatStore.getState().addMessage({ role: 'user', content: longMsg })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'response' })
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText('a'.repeat(80) + '…')).toBeTruthy()
  })

  it('shows density nudge when agent response > 300 chars', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'x'.repeat(301) })
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText(/Conversation getting long/)).toBeTruthy()
  })

  it('shows density nudge when turnCount >= 5', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'short response' })
    for (let i = 0; i < 5; i++) useChatStore.getState().incrementTurnCount()
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText(/Conversation getting long/)).toBeTruthy()
  })

  it('calls onOpenPanel when "Open full chat" is clicked', () => {
    const onOpenPanel = vi.fn()
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'x'.repeat(301) })
    render(<FloatingChatBar {...defaultProps} onOpenPanel={onOpenPanel} />)
    fireEvent.click(screen.getByText(/Open full chat/))
    expect(onOpenPanel).toHaveBeenCalled()
  })

  it('renders nothing when panelOpen is true', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'response' })
    useChatStore.getState().setPanelOpen(true)
    const { container } = render(<FloatingChatBar {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/renderer/__tests__/FloatingChatBar.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `FloatingChatBar.tsx`**

Create `src/renderer/chat/FloatingChatBar.tsx`:

```typescript
import React, { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChatStore } from '../store/chatStore'

interface Props {
  open: boolean
  onSubmit(text: string): void
  onDismiss(): void
  onOpenPanel(): void
}

export function FloatingChatBar({ open, onSubmit, onDismiss, onOpenPanel }: Props) {
  const [value, setValue] = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const turnCount = useChatStore((s) => s.turnCount)
  const panelOpen = useChatStore((s) => s.panelOpen)

  const hasMessages = messages.length > 0
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === 'assistant')

  const agentResponseLong = (lastAgentMsg?.content.length ?? 0) > 300
  const showNudge = !nudgeDismissed && (agentResponseLong || turnCount >= 5)

  useEffect(() => {
    if (open && !hasMessages) inputRef.current?.focus()
  }, [open, hasMessages])

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || status === 'generating') return
    onSubmit(trimmed)
    setValue('')
  }

  // Hide while panel is open
  if (panelOpen) return null

  // Nothing to show if not triggered and no messages
  if (!open && !hasMessages) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[480px] flex flex-col gap-2 pointer-events-none">
      {/* Exchange mode: latest messages */}
      {hasMessages && (
        <div className="flex flex-col gap-2 pointer-events-auto">
          {lastUserMsg && (
            <div className="flex justify-end">
              <span className="bg-[#2a2a2a] text-[#aaaaaa] text-sm px-3 py-1.5 rounded-full max-w-[80%] truncate">
                {lastUserMsg.content.length > 80
                  ? lastUserMsg.content.slice(0, 80) + '…'
                  : lastUserMsg.content}
              </span>
            </div>
          )}
          {lastAgentMsg && (
            <div className="relative bg-[#161616] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#e0e0e0] leading-relaxed overflow-hidden">
              <div className={agentResponseLong ? 'max-h-[120px] overflow-hidden' : ''}>
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
                      return inline
                        ? <code className="bg-[#1a1a1a] rounded px-1 text-[#e0e0e0] font-mono text-xs" {...props}>{children}</code>
                        : <code className="block bg-[#1a1a1a] border border-[#2a2a2a] rounded-md p-3 overflow-x-auto font-mono text-xs mt-2" {...props}>{children}</code>
                    }
                  }}
                >
                  {agentResponseLong
                    ? lastAgentMsg.content.slice(0, 300)
                    : lastAgentMsg.content}
                </ReactMarkdown>
              </div>
              {agentResponseLong && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#161616] to-transparent pointer-events-none" />
              )}
            </div>
          )}
          {showNudge && (
            <div className="flex items-center justify-between text-xs text-[#555] px-1">
              <span>
                Conversation getting long —{' '}
                <button
                  onClick={() => { onOpenPanel(); setNudgeDismissed(true) }}
                  className="text-[#888] hover:text-[#e0e0e0] underline transition-colors"
                >
                  Open full chat →
                </button>
              </span>
              <button
                onClick={() => setNudgeDismissed(true)}
                className="text-[#444] hover:text-[#666] transition-colors ml-2"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-full px-4 py-2.5 flex items-center gap-3 shadow-lg pointer-events-auto">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape' && !hasMessages) onDismiss()
          }}
          placeholder={status === 'generating' ? 'Generating…' : 'Ask anything (⌘K)'}
          disabled={status === 'generating'}
          className="flex-1 bg-transparent text-[#e0e0e0] text-sm outline-none placeholder:text-[#555]"
        />
        {status === 'generating' ? (
          <span className="w-2 h-2 bg-primary rounded-full animate-pulse flex-shrink-0" />
        ) : value ? (
          <button
            onClick={handleSubmit}
            className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0"
            aria-label="Send"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/renderer/__tests__/FloatingChatBar.test.tsx 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/chat/FloatingChatBar.tsx src/renderer/__tests__/FloatingChatBar.test.tsx
git commit -m "feat: add FloatingChatBar component"
```

---

## Task 5: Update `AppLayout` — wire FloatingChatBar + trigger button, delete CommandBar

**Files:**
- Modify: `src/renderer/layout/AppLayout.tsx`
- Delete: `src/renderer/chat/CommandBar.tsx`

- [ ] **Step 1: Replace `AppLayout.tsx`**

```typescript
import React, { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useChat } from '../chat/useChat'
import { FloatingChatBar } from '../chat/FloatingChatBar'
import { ChatPanel } from '../chat/ChatPanel'
import { SlateCanvas } from '../canvas/SlateCanvas'

interface AppLayoutProps {
  onOpenConfig?: () => void
}

export function AppLayout({ onOpenConfig }: AppLayoutProps) {
  const [cmdBarOpen, setCmdBarOpen] = useState(false)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const setPanelOpen = useChatStore((s) => s.setPanelOpen)
  const messages = useChatStore((s) => s.messages)
  const { submit } = useChat()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdBarOpen((v) => !v)
      }
      if (e.key === 'Escape') setCmdBarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
        {panelOpen && (
          <ChatPanel
            onSubmit={handleSubmit}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {/* Floating trigger button — visible only before any conversation starts */}
      {showTriggerButton && (
        <button
          onClick={() => setCmdBarOpen(true)}
          title="Ask anything (⌘K)"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-10 h-10 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full flex items-center justify-center text-[#555] hover:text-[#aaa] hover:border-[#444] transition-colors shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </button>
      )}

      <FloatingChatBar
        open={cmdBarOpen}
        onSubmit={handleSubmit}
        onDismiss={() => setCmdBarOpen(false)}
        onOpenPanel={() => setPanelOpen(true)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Delete CommandBar.tsx**

```bash
git rm src/renderer/chat/CommandBar.tsx
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: same pass count as baseline (167 passing, 1 pre-existing failure in App.test.tsx)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/layout/AppLayout.tsx
git commit -m "feat: wire FloatingChatBar and trigger button in AppLayout"
```

---

## Task 6: Redesign `MessageList` with react-markdown

**Files:**
- Modify: `src/renderer/chat/MessageList.tsx`

- [ ] **Step 1: Replace `MessageList.tsx`**

```typescript
import React, { useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChatStore } from '../store/chatStore'

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555] px-6 text-center gap-2">
        <p className="text-sm">Describe a component and it will appear on your Slate canvas.</p>
        <p className="text-xs opacity-70">You can iterate: "make it blue", "add a search bar"</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {messages.map((msg, i) => (
        <div key={i}>
          {msg.role === 'user' ? (
            <div className="flex justify-end">
              <span className="bg-[#2a2a2a] text-[#aaaaaa] text-sm px-3 py-1.5 rounded-full max-w-[60%] break-words">
                {msg.content}
              </span>
            </div>
          ) : (
            <div>
              <div className="text-sm leading-relaxed text-[#e0e0e0]">
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
                      return inline
                        ? <code className="bg-[#1a1a1a] rounded px-1 text-[#e0e0e0] font-mono text-xs" {...props}>{children}</code>
                        : <code className="block bg-[#1a1a1a] border border-[#2a2a2a] rounded-md p-3 overflow-x-auto font-mono text-xs mt-2 mb-2" {...props}>{children}</code>
                    },
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-[#f0f0f0]">{children}</strong>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => navigator.clipboard.writeText(msg.content)}
                  className="text-[#444] hover:text-[#777] transition-colors"
                  title="Copy"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.637c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                </button>
                <button className="text-[#444] hover:text-[#777] transition-colors" title="Good response">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
                  </svg>
                </button>
                <button className="text-[#444] hover:text-[#777] transition-colors" title="Bad response">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Run tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: same pass count as previous step

- [ ] **Step 4: Commit**

```bash
git add src/renderer/chat/MessageList.tsx
git commit -m "feat: redesign MessageList with react-markdown and pill styling"
```

---

## Task 7: Redesign `ChatPanel`

**Files:**
- Modify: `src/renderer/chat/ChatPanel.tsx`

- [ ] **Step 1: Replace `ChatPanel.tsx`**

```typescript
import React, { useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { MessageList } from './MessageList'
import { PublishToast } from './PublishToast'

interface Props {
  onSubmit(text: string): void
  onClose(): void
}

export function ChatPanel({ onSubmit, onClose }: Props) {
  const [input, setInput] = useState('')
  const status = useChatStore((s) => s.status)

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || status === 'generating') return
    onSubmit(trimmed)
    setInput('')
  }

  return (
    <div className="flex flex-col w-[360px] flex-shrink-0 bg-[#0d0d0d]">
      {/* Minimal header — close button only */}
      <div className="flex items-center justify-end px-3 py-2 flex-shrink-0">
        <button
          aria-label="close"
          onClick={onClose}
          className="text-[#555] hover:text-[#aaa] transition-colors p-1 rounded"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <MessageList />
      </div>

      <PublishToast />

      <div className="p-3 flex-shrink-0">
        {/* Pill-shaped input */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-2.5 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            placeholder={status === 'generating' ? 'Generating…' : 'Ask anything (⌘K)'}
            disabled={status === 'generating'}
            className="flex-1 bg-transparent text-[#e0e0e0] text-sm outline-none placeholder:text-[#555]"
          />
          {status === 'generating' ? (
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse flex-shrink-0" />
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              aria-label="send"
            >
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            </button>
          )}
        </div>

        {/* Decorative bottom toolbar */}
        <div className="flex items-center gap-3 px-1 mt-2">
          <button className="text-[#333] hover:text-[#555] transition-colors" title="Attach (coming soon)" aria-label="Attach">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button className="text-[#333] hover:text-[#555] transition-colors" title="Code mode (coming soon)" aria-label="Code mode">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </button>
          <span className="text-[#333] text-xs flex-1 text-center select-none">CSlate Agent</span>
          <button className="text-[#333] hover:text-[#555] transition-colors" title="Voice (coming soon)" aria-label="Voice">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: 167 passing (same as baseline), 1 pre-existing failure in App.test.tsx

- [ ] **Step 4: Commit**

```bash
git add src/renderer/chat/ChatPanel.tsx
git commit -m "feat: redesign ChatPanel with dark styling and pill input"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full type-check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no output (no errors)

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: 170+ passing (167 baseline + new chatStore + FloatingChatBar + updated useChat tests), 1 pre-existing failure

- [ ] **Step 3: Verify worktree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 4: Log the feature branch commits**

```bash
git log main..HEAD --oneline
```

Expected: 7–8 commits from this feature (react-markdown, chatStore, useChat, FloatingChatBar, AppLayout, MessageList, ChatPanel)
