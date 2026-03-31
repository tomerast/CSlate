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
                    code({ node, inline, className, children, ...props }) {
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
