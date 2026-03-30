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
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.929 2.929l1.06 1.06M10.01 10.01l1.06 1.06M2.929 11.071l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
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
