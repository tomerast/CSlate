import React, { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useChat } from '../chat/useChat'
import { SessionList } from '../chat/SessionList'
import { MessageList } from '../chat/MessageList'
import { DockedChatBar } from '../chat/DockedChatBar'
import { Header } from './Header'

interface AppLayoutProps {
  onOpenConfig?: () => void
  onOpenMemory?: () => void
  modelId: string
}

export function AppLayout({ onOpenConfig, onOpenMemory, modelId }: AppLayoutProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const { submit, startNewSession, loadSession, refreshSessions, regenerateLast, forkFromMessage } =
    useChat(modelId)

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
    <div className="h-screen flex overflow-hidden bg-background text-text">
      <SessionList onNewSession={startNewSession} onLoadSession={loadSession} />
      <main className="flex-1 flex flex-col min-w-0">
        <Header
          modelId={modelId}
          onOpenConfig={onOpenConfig ?? (() => {})}
          onOpenMemory={onOpenMemory ?? (() => {})}
        />
        <MessageList onRegenerate={regenerateLast} onFork={forkFromMessage} />
        <DockedChatBar onSubmit={submit} />
      </main>
    </div>
  )
}
