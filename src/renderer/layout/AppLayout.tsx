import React, { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { useChatStore } from '../store/chatStore'
import { useChat } from '../chat/useChat'
import { SessionList } from '../chat/SessionList'
import { MessageList } from '../chat/MessageList'
import { Header } from './Header'
import { HeroInput } from '../chat/HeroInput'
import { parseModelId } from '../lib/modelParser'

interface AppLayoutProps {
  onOpenConfig?: () => void
  onOpenMemory?: () => void
  modelId: string
}

export function AppLayout({ onOpenConfig, onOpenMemory, modelId }: AppLayoutProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const messages = useChatStore((s) => s.messages)
  const status = useChatStore((s) => s.status)
  const isGenerating = status === 'generating'

  const {
    submit,
    startNewSession,
    loadSession,
    refreshSessions,
    regenerateLast,
    forkFromMessage,
  } = useChat(modelId)

  const hasMessages = messages.length > 0
  const isHero = !hasMessages && !isGenerating
  const modelMeta = parseModelId(modelId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledUp, setScrolledUp] = React.useState(false)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    setScrolledUp(!nearBottom)
  }, [])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  return (
    <div className="app-shell h-screen flex overflow-hidden text-text relative">
      <SessionList
        onNewSession={startNewSession}
        onLoadSession={loadSession}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <div
          className="absolute top-0 left-0 right-0 z-40 transition-opacity duration-300 pointer-events-none"
          style={{ opacity: scrolledUp ? 0.25 : 1 }}
        >
          <div className="pointer-events-auto">
            <Header
              modelId={modelId}
              onOpenConfig={onOpenConfig ?? (() => {})}
              onOpenMemory={onOpenMemory ?? (() => {})}
            />
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth"
        >
          {isHero ? (
            <div className="min-h-full flex flex-col items-center justify-center px-6 pt-20 pb-14">
              <div className="w-full max-w-[680px] -translate-y-8 msg-enter">
                <div className="mb-7 text-center">
                  <div
                    className="mx-auto mb-5 h-9 w-9 rounded-xl border border-white/[0.07] bg-white/[0.026] flex items-center justify-center"
                    style={{ boxShadow: `0 0 24px ${modelMeta.color}16` }}
                  >
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: modelMeta.color }} />
                  </div>
                  <h1 className="text-[28px] font-medium text-text text-center tracking-normal leading-tight">
                    What should we explore?
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-muted/58">
                    Start with a question, a plan, a comparison, or a hunch.
                  </p>
                </div>
                <HeroInput
                  onSubmit={async (msg) => { await submit(msg) }}
                  modelId={modelId}
                  isGenerating={isGenerating}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="pb-40 pt-14">
                <MessageList
                  modelId={modelId}
                  onRegenerate={regenerateLast}
                  onFork={forkFromMessage}
                />
              </div>
            </>
          )}
        </div>

        {!isHero && (
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-8 z-30 pointer-events-none"
            style={{
              background: 'linear-gradient(to top, var(--slate-bg) 58%, rgba(10,10,15,0.72) 78%, transparent 100%)',
            }}
          >
            <div className="max-w-[680px] mx-auto pointer-events-auto">
              <HeroInput
                onSubmit={submit}
                modelId={modelId}
                isGenerating={isGenerating}
                suggestions={[]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
