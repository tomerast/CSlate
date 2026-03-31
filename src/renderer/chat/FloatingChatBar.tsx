import React, { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChatStore } from '../store/chatStore'

interface Props {
  open: boolean
  nudgeDismissed: boolean
  onSubmit(text: string): void
  onDismiss(): void
  onOpenPanel(): void
  onDismissNudge(): void
}

export function FloatingChatBar({ open, nudgeDismissed, onSubmit, onDismiss, onOpenPanel, onDismissNudge }: Props) {
  const [value, setValue] = useState('')
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

  if (panelOpen) return null
  if (!open && !hasMessages) return null

  return (
    <div className="chat-float-enter fixed bottom-6 left-1/2 z-50 w-[480px] flex flex-col gap-2 pointer-events-none"
         style={{ transform: 'translateX(-50%)' }}>

      {/* Exchange mode: latest messages */}
      {hasMessages && (
        <div className="flex flex-col gap-2 pointer-events-auto">
          {lastUserMsg && (
            <div className="msg-enter flex justify-end">
              <span className="bg-primary/10 border border-primary/20 text-accent text-sm px-3 py-1.5 rounded-full max-w-[80%] truncate">
                {lastUserMsg.content.length > 80
                  ? lastUserMsg.content.slice(0, 80) + '…'
                  : lastUserMsg.content}
              </span>
            </div>
          )}
          {lastAgentMsg && (
            <div className="msg-enter relative bg-[rgba(26,26,35,0.85)] backdrop-blur-xl border border-white/[0.07] rounded-2xl px-4 py-3 text-sm text-text leading-relaxed overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className={agentResponseLong ? 'max-h-[120px] overflow-hidden' : ''}>
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: { node?: unknown; inline?: boolean; className?: string; children?: React.ReactNode }) {
                      return inline
                        ? <code className="bg-background rounded px-1 text-text font-mono text-xs border border-border/40" {...props}>{children}</code>
                        : <code className="block bg-background border border-border rounded-md p-3 overflow-x-auto font-mono text-xs mt-2" {...props}>{children}</code>
                    }
                  }}
                >
                  {agentResponseLong
                    ? lastAgentMsg.content.slice(0, 300)
                    : lastAgentMsg.content}
                </ReactMarkdown>
              </div>
              {agentResponseLong && (
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[rgba(26,26,35,0.95)] to-transparent pointer-events-none" />
              )}
            </div>
          )}
          {showNudge && (
            <div className="flex items-center justify-between text-xs text-muted/60 px-1">
              <span>
                Conversation getting long —{' '}
                <button
                  onClick={() => { onOpenPanel(); onDismissNudge() }}
                  className="text-muted hover:text-text underline transition-colors duration-150"
                >
                  Open full chat →
                </button>
              </span>
              <button
                onClick={onDismissNudge}
                className="text-muted/40 hover:text-muted transition-colors duration-150 ml-2"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input bar — glass pill */}
      <div className="bg-[rgba(26,26,35,0.88)] backdrop-blur-xl border border-white/[0.08] rounded-full px-4 py-2.5 flex items-center gap-3 shadow-[0_16px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)] pointer-events-auto">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape' && !hasMessages) onDismiss()
          }}
          placeholder={status === 'generating' ? '' : 'Ask anything (⌘K)'}
          disabled={status === 'generating'}
          className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-muted/50"
        />
        {status === 'generating' ? (
          <span className="flex items-center gap-1 flex-shrink-0">
            <span className="generating-dot" />
            <span className="generating-dot" />
            <span className="generating-dot" />
          </span>
        ) : value ? (
          <button
            onClick={handleSubmit}
            className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors duration-150 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
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
