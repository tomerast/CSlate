import React, { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useChat } from '../chat/useChat'
import { CommandBar } from '../chat/CommandBar'
import { ChatPanel } from '../chat/ChatPanel'
import { SlateCanvas } from '../canvas/SlateCanvas'

export function AppLayout() {
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
      <div className="h-8 flex-shrink-0 app-drag-region" />
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

export default AppLayout
