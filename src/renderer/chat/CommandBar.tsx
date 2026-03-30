import React, { useRef, useEffect, useState } from 'react'
import { useChatStore } from '../store/chatStore'

interface Props {
  onSubmit(text: string): void
  onDismiss(): void
}

export function CommandBar({ onSubmit, onDismiss }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const status = useChatStore((s) => s.status)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || status === 'generating') return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center z-50 pt-[20vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />
      <div className="relative w-full max-w-2xl mx-4">
        <div className="bg-surface rounded-lg shadow-lg border border-border overflow-hidden">
          <div className="flex items-center px-4 py-3 gap-3">
            <svg className="w-5 h-5 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
                if (e.key === 'Escape') onDismiss()
              }}
              placeholder={status === 'generating' ? 'Generating...' : 'Describe a component...'}
              disabled={status === 'generating'}
              className="flex-1 bg-transparent text-text text-base outline-none placeholder:text-muted"
            />
            {value && (
              <kbd className="px-2 py-0.5 text-xs text-muted bg-background rounded border border-border">⏎</kbd>
            )}
          </div>
          {status === 'generating' && (
            <div className="px-4 py-2 border-t border-border flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <span className="text-xs text-muted">Building your component...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
