import React, { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { useChatStore } from '../store/chatStore'
import { useChat } from '../chat/useChat'
import { SessionList } from '../chat/SessionList'
import { MessageList } from '../chat/MessageList'
import { Header } from './Header'
import { HeroInput } from '../chat/HeroInput'

interface AppLayoutProps {
  onOpenConfig?: () => void
  onOpenMemory?: () => void
  modelId: string
}

export function AppLayout({ onOpenConfig, onOpenMemory, modelId }: AppLayoutProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const activeProvider = useAppStore((s) => s.activeProvider)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)

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
    <div className="h-screen flex overflow-hidden bg-background text-text relative">
      <SessionList
        onNewSession={startNewSession}
        onLoadSession={loadSession}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Floating header overlay — fades when scrolled up */}
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
            <div className="h-full flex flex-col items-center justify-center px-6">
              <div className="w-full max-w-2xl">
                <h1 className="text-[28px] font-medium text-text text-center mb-8 tracking-tight"
                >
                  What should we explore?
                </h1>
                <HeroInput
                  onSubmit={async (msg) => { await submit(msg) }}
                  activeProvider={activeProvider}
                  onProviderChange={setActiveProvider}
                  isGenerating={isGenerating}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="pb-40 pt-14">
                <MessageList
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
              background: 'linear-gradient(to top, var(--slate-bg) 60%, transparent 100%)',
            }}
          >
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <HeroInput
                onSubmit={submit}
                activeProvider={activeProvider}
                onProviderChange={setActiveProvider}
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
