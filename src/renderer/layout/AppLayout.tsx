import React, { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useChat } from '../chat/useChat'
import { CommandBar } from '../chat/CommandBar'
import { ChatPanel } from '../chat/ChatPanel'
import { SlateCanvas } from '../canvas/SlateCanvas'

interface AppLayoutProps {
  onOpenConfig?: () => void
}

export function AppLayout({ onOpenConfig }: AppLayoutProps) {
  const [cmdBarOpen, setCmdBarOpen] = useState(false)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const setPanelOpen = useChatStore((s) => s.setPanelOpen)
  const { submit } = useChat()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdBarOpen((v) => !v)
      }
      if (e.key === 'Escape') setCmdBarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleSubmit = useCallback(async (text: string) => {
    setCmdBarOpen(false)
    await submit(text)
  }, [submit])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="h-8 flex-shrink-0 app-drag-region relative">
        <button
          onClick={onOpenConfig}
          title="Settings (⌘,)"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted/50 hover:text-muted transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <SlateCanvas />
        {panelOpen && (
          <ChatPanel
            onSubmit={handleSubmit}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
      {cmdBarOpen && (
        <CommandBar onSubmit={handleSubmit} onDismiss={() => setCmdBarOpen(false)} />
      )}
    </div>
  )
}
