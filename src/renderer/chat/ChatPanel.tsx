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
  const statusLabel = useChatStore((s) => s.statusLabel)

  function handleSubmit() {
    const trimmed = input.trim()
    if (!trimmed || status === 'generating') return
    onSubmit(trimmed)
    setInput('')
  }

  return (
    <div className="flex flex-col w-[360px] flex-shrink-0 border-l border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-text">Component Builder</span>
        <button
          aria-label="close"
          onClick={onClose}
          className="text-muted hover:text-text transition-colors p-1 rounded"
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

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            placeholder={status === 'generating' ? 'Generating...' : 'Refine or describe changes...'}
            disabled={status === 'generating'}
            className="flex-1 bg-surface text-text text-sm border border-border rounded-md px-3 py-2 outline-none focus:border-primary placeholder:text-muted"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || status === 'generating'}
            className="px-3 py-2 bg-primary text-white rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity"
            aria-label="send"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          </button>
        </div>
        {status === 'generating' && (
          <p className="text-xs text-muted mt-2 flex items-center gap-1">
            <span className="inline-block w-1 h-1 bg-primary rounded-full animate-ping" />
            {statusLabel || 'Generating...'}
          </p>
        )}
      </div>
    </div>
  )
}
