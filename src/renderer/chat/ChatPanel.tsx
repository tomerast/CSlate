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
    <div className="flex flex-col w-[360px] flex-shrink-0 bg-background border-l border-border/40">
      {/* Minimal header — close button only */}
      <div className="flex items-center justify-end px-3 py-2 flex-shrink-0">
        <button
          aria-label="close"
          onClick={onClose}
          className="text-muted/40 hover:text-muted transition-colors duration-150 p-1 rounded"
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

      <div className="p-3 flex-shrink-0 border-t border-border/30">
        {/* Pill-shaped input */}
        <div className="bg-surface border border-border rounded-full px-4 py-2.5 flex items-center gap-2 focus-within:border-primary/40 transition-colors duration-150">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
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
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-30 hover:bg-primary/90 transition-all duration-150 shadow-[0_0_12px_rgba(99,102,241,0.35)] disabled:shadow-none"
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
          <button className="text-muted/25 hover:text-muted/60 transition-colors duration-150" title="Attach (coming soon)" aria-label="Attach">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button className="text-muted/25 hover:text-muted/60 transition-colors duration-150" title="Code mode (coming soon)" aria-label="Code mode">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
          </button>
          <span className="text-muted/25 text-xs flex-1 text-center select-none tracking-wide">CSlate Agent</span>
          <button className="text-muted/25 hover:text-muted/60 transition-colors duration-150" title="Voice (coming soon)" aria-label="Voice">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
