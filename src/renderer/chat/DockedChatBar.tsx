import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useChatStore } from '../store/chatStore'

interface DockedChatBarProps {
  onSubmit: (text: string) => void | Promise<void>
}

const MAX_ROWS = 8
const MIN_HEIGHT = 44
const LINE_HEIGHT = 20

export function DockedChatBar({ onSubmit }: DockedChatBarProps) {
  const [value, setValue] = useState('')
  const status = useChatStore((s) => s.status)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, MIN_HEIGHT + MAX_ROWS * LINE_HEIGHT)
    ta.style.height = `${Math.max(MIN_HEIGHT, next)}px`
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  const handleSubmit = useCallback(async () => {
    const text = value.trim()
    if (!text || status === 'generating') return
    setValue('')
    await onSubmit(text)
  }, [value, status, onSubmit])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSubmit()
      }
    },
    [handleSubmit],
  )

  const disabled = status === 'generating'

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-3xl px-6 py-4">
        <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-surface/80 shadow-sm focus-within:border-primary/40 focus-within:shadow-md transition-all">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything…"
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-text placeholder:text-muted/60 focus:outline-none disabled:opacity-50"
            style={{ minHeight: MIN_HEIGHT }}
          />
          <button
            onClick={() => void handleSubmit()}
            disabled={disabled || !value.trim()}
            className="m-1.5 grid h-9 w-9 place-items-center rounded-xl bg-primary text-white transition-colors disabled:bg-primary/30 hover:bg-primary/90"
            title="Send (Enter)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
