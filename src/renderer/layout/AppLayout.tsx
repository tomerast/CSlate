import React, { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore, type CanvasComponent } from '../store/canvasStore'
import { useChat } from '../chat/useChat'
import { FloatingChatBar } from '../chat/FloatingChatBar'
import { ChatPanel } from '../chat/ChatPanel'
import { SlateCanvas } from '../canvas/SlateCanvas'

interface AppLayoutProps {
  onOpenConfig?: () => void
}

export function AppLayout({ onOpenConfig }: AppLayoutProps) {
  const [cmdBarOpen, setCmdBarOpen] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const setPanelOpen = useChatStore((s) => s.setPanelOpen)
  const messages = useChatStore((s) => s.messages)
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

  useEffect(() => {
    window.electron.invoke('canvas:load', { projectDir: '' }).then((result: unknown) => {
      const r = result as { components?: CanvasComponent[] } | null
      if (Array.isArray(r?.components) && r.components.length > 0) {
        useCanvasStore.getState().hydrate(r.components)
      }
    }).catch(() => {
      // No project open yet — canvas starts empty
    })
  }, [])

  const handleSubmit = useCallback(async (text: string) => {
    setCmdBarOpen(false)
    await submit(text)
  }, [submit])

  const showTriggerButton = messages.length === 0 && !panelOpen && !cmdBarOpen

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

      {/* Floating trigger button — visible only before any conversation starts */}
      {showTriggerButton && (
        <button
          onClick={() => setCmdBarOpen(true)}
          title="Ask anything (⌘K)"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-10 h-10 bg-surface border border-border rounded-full flex items-center justify-center text-muted/40 hover:text-primary/70 hover:border-primary/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.18)] transition-all duration-200 shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
          </svg>
        </button>
      )}

      <FloatingChatBar
        open={cmdBarOpen}
        nudgeDismissed={nudgeDismissed}
        onSubmit={handleSubmit}
        onDismiss={() => setCmdBarOpen(false)}
        onOpenPanel={() => setPanelOpen(true)}
        onDismissNudge={() => setNudgeDismissed(true)}
      />
    </div>
  )
}
