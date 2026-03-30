import React, { useRef, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted px-6 text-center gap-2">
        <p className="text-sm">Describe a component and it will appear on your Slate canvas.</p>
        <p className="text-xs opacity-70">You can iterate: "make it blue", "add a search bar"</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`rounded-md px-3 py-2 text-sm ${
            msg.role === 'user'
              ? 'bg-primary/20 text-text ml-6'
              : 'bg-surface text-text mr-6 border border-border'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
