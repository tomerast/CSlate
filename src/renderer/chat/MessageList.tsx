import React, { useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useChatStore, type OrchestratorPhase } from '../store/chatStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'
import { OrchestratorProgress } from './OrchestratorProgress'
import { parseModelId } from '../lib/modelParser'
import type { AgentMessage, MessageCard } from '@shared/agentTypes'

interface MessageListProps {
  onRegenerate?: () => void | Promise<void>
  onFork?: (messageId: string) => void | Promise<void>
  modelId?: string
}

export function MessageList({ onRegenerate, onFork, modelId = '' }: MessageListProps) {
  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const error = useChatStore((s) => s.error)
  const orchestrator = useChatStore((s) => s.orchestrator)
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    shouldAutoScroll.current = nearBottom
  }, [])

  useEffect(() => {
    if (shouldAutoScroll.current) {
      const el = containerRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, status, orchestrator])

  const lastAssistantIdx = findLastAssistantIdx(messages)

  // Only show the progress bar during the actual component build phases.
  // The initial understand/search/plan steps are fast; the progress bar
  // only makes sense when we're dispatching workers and assembling the result.
  const BUILD_PHASES: OrchestratorPhase[] = ['dispatch', 'worker', 'validate', 'ship', 'fix']
  const isBuildPhase = orchestrator.currentPhase
    ? BUILD_PHASES.includes(orchestrator.currentPhase)
    : false
  const showOrchestrator = status === 'generating' && isBuildPhase
  const showErrorInline = error && status !== 'generating'

  if (messages.length === 0 && !showOrchestrator) {
    return <EmptyState />
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
    >
      <div className="mx-auto max-w-3xl px-6 py-12 space-y-12">
        {messages.map((msg, idx) => (
          <MessageBlock
            key={msg.id}
            message={msg}
            isLatestAssistant={idx === lastAssistantIdx}
            showError={!!showErrorInline && idx === lastAssistantIdx}
            error={showErrorInline && idx === lastAssistantIdx ? error : null}
            onRegenerate={onRegenerate}
            onFork={onFork}
          />
        ))}

        {showOrchestrator && (
          <div className="py-2">
            <OrchestratorProgress status={orchestrator} modelId={modelId} />
          </div>
        )}

        {status === 'generating' && !showOrchestrator && <ThinkingIndicator modelId={modelId} />}

        {!showErrorInline && error && (
          <div className="py-4">
            <ErrorBubble message={error} />
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBlock({
  message,
  isLatestAssistant,
  showError,
  error,
  onRegenerate,
  onFork,
}: {
  message: AgentMessage
  isLatestAssistant: boolean
  showError?: boolean
  error?: string | null
  onRegenerate?: () => void | Promise<void>
  onFork?: (messageId: string) => void | Promise<void>
}) {
  const isUser = message.role === 'user'
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (isUser) {
    return (
      <article className="group space-y-2 pt-2">
        <h2 className="max-w-2xl text-[22px] font-medium text-text leading-snug tracking-normal">
          {message.content}
        </h2>
        <div className="flex items-center gap-2 text-[11px] text-muted/40">
          <span>{time}</span>
        </div>
      </article>
    )
  }

  return (
    <article className="group space-y-5">
      {message.content && (
        <div className="prose prose-invert max-w-none text-[15px] leading-[1.78] text-text/90 prose-p:my-3 prose-a:text-primary prose-strong:text-text prose-code:text-text prose-code:bg-white/[0.05] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      )}

      {message.cards.length > 0 && (
        <div className="space-y-4">
          {message.cards.map((card, i) => (
            <InlineCard key={`${message.id}-card-${i}`} card={card} />
          ))}
        </div>
      )}

      {showError && error && <ErrorBubble message={error} />}

      <MessageActions
        message={message}
        canRegenerate={isLatestAssistant}
        onRegenerate={onRegenerate}
        onFork={onFork}
      />
    </article>
  )
}

interface MessageActionsProps {
  message: AgentMessage
  canRegenerate: boolean
  onRegenerate?: () => void | Promise<void>
  onFork?: (messageId: string) => void | Promise<void>
}

function MessageActions({ message, canRegenerate, onRegenerate, onFork }: MessageActionsProps) {
  return (
    <div className="flex items-center gap-3 pt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
      <ActionButton
        title="Copy"
        onClick={() => navigator.clipboard.writeText(message.content)}
      >
        <CopyIcon />
      </ActionButton>
      {onFork && (
        <ActionButton title="Fork from this message" onClick={() => void onFork(message.id)}>
          <ForkIcon />
        </ActionButton>
      )}
      {canRegenerate && onRegenerate && (
        <ActionButton title="Regenerate" onClick={() => void onRegenerate()}>
          <RefreshIcon />
        </ActionButton>
      )}
    </div>
  )
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid h-7 w-7 place-items-center rounded-lg text-muted/40 hover:text-text hover:bg-white/[0.055] transition-colors"
    >
      {children}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.637c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 4.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm0 10.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm9-10.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM7.5 9v6m9-6v3a3 3 0 0 1-3 3H7.5" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}

function InlineCard({ card }: { card: MessageCard }) {
  return (
    <div className="card-enter my-6">
      <DynamicComponent bundle={card.bundle} manifest={card.manifest} variant="inline" />
      <CardFooter card={card} />
    </div>
  )
}

function CardFooter({ card }: { card: MessageCard }) {
  const tag = card.source === 'server' ? 'from library' : 'generated just now'
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted/40">
      <span className="inline-block h-1 w-1 rounded-full bg-primary/30" />
      {tag}
      {typeof card.score === 'number' && (
        <span className="text-muted/30">- {(card.score * 100).toFixed(0)}% match</span>
      )}
    </div>
  )
}

function ThinkingIndicator({ modelId }: { modelId: string }) {
  const meta = parseModelId(modelId)

  return (
    <div className="msg-enter py-2">
      <div className="inline-flex items-center gap-3 rounded-full border border-white/[0.045] bg-white/[0.022] px-3 py-2 text-xs text-muted/62">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-25 animate-ping"
            style={{ backgroundColor: meta.color }}
          />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
        </span>
        <span>Thinking with {meta.displayName}</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="h-1 w-1 rounded-full bg-current opacity-30 animate-pulse" />
          <span className="h-1 w-1 rounded-full bg-current opacity-30 animate-pulse [animation-delay:140ms]" />
          <span className="h-1 w-1 rounded-full bg-current opacity-30 animate-pulse [animation-delay:280ms]" />
        </span>
      </div>
    </div>
  )
}

function ErrorBubble({ message }: { message: string }) {
  return (
    <div className="msg-enter rounded-xl border border-error/20 bg-error/[0.04] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-error/10 flex items-center justify-center">
          <svg className="w-3 h-3 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-error/80">Something went wrong</div>
          <div className="text-xs text-error/50 mt-0.5">{message}</div>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 shadow-[0_0_36px_rgba(124,108,255,0.16)]">
        <svg className="w-6 h-6 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      </div>
      <h2 className="text-lg font-medium text-text mb-2">Ask anything</h2>
      <p className="text-sm text-muted max-w-sm">Start with the thing you want to understand.</p>
    </div>
  )
}

function findLastAssistantIdx(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return i
  }
  return -1
}
