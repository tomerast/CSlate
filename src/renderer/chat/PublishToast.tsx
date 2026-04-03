import React, { useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatStore'

const COUNTDOWN_MS = 120_000

export function PublishToast() {
  const publishState = useChatStore((s) => s.publishState)
  const setPublishState = useChatStore((s) => s.setPublishState)
  const publishPayload = useChatStore((s) => s.publishPayload)
  const panelOpen = useChatStore((s) => s.panelOpen)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPanelOpenRef = useRef<boolean>(panelOpen)

  // Auto-upload after countdown expires
  useEffect(() => {
    if (publishState !== 'countdown') return
    timerRef.current = setTimeout(() => {
      handleShare()
    }, COUNTDOWN_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [publishState])

  // Cancel countdown when panel closes (only on open→closed transition)
  useEffect(() => {
    const wasOpen = prevPanelOpenRef.current
    prevPanelOpenRef.current = panelOpen
    if (wasOpen && !panelOpen && publishState === 'countdown') {
      if (timerRef.current) clearTimeout(timerRef.current)
      setPublishState('hidden')
    }
  }, [panelOpen])

  // Auto-hide after published
  useEffect(() => {
    if (publishState !== 'published') return
    const timer = setTimeout(() => setPublishState('hidden'), 3000)
    return () => clearTimeout(timer)
  }, [publishState])

  async function handleShare() {
    if (!publishPayload) {
      setPublishState('hidden')
      return
    }
    setPublishState('publishing')
    try {
      const result = await window.electron.invoke('server:publish', publishPayload) as { error?: string }
      if (result?.error) {
        setPublishState('hidden')
      } else {
        setPublishState('published')
      }
    } catch {
      setPublishState('hidden')
    }
  }

  function handleKeepPrivate() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPublishState('hidden')
  }

  if (publishState === 'hidden' || !publishPayload) return null

  if (publishState === 'published') {
    return (
      <div className="mx-3 mb-2 p-3 bg-success/10 border border-success/30 rounded-md">
        <div className="flex items-center gap-2 text-sm text-success">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>Shared! Your component is being reviewed.</span>
        </div>
      </div>
    )
  }

  if (publishState === 'publishing') {
    return (
      <div className="mx-3 mb-2 p-3 bg-surface border border-border rounded-md">
        <div className="flex items-center gap-2 text-sm text-text">
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Sharing...</span>
        </div>
      </div>
    )
  }

  // publishState === 'countdown'
  return (
    <div className="mx-3 mb-2 bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-sm text-text">Sharing with community…</span>
        <button
          onClick={handleKeepPrivate}
          className="px-3 py-1 text-xs text-muted hover:text-text border border-border rounded-md transition-colors flex-shrink-0"
        >
          Keep private
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Sharing countdown"
        className="h-0.5 bg-primary/40 origin-left"
        style={{
          animation: `shrink ${COUNTDOWN_MS}ms linear forwards`,
        }}
      />
      <style>{`
        @keyframes shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  )
}
