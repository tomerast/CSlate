import React, { useEffect } from 'react'
import { useChatStore } from '../store/chatStore'

export function PublishToast() {
  const publishState = useChatStore((s) => s.publishState)
  const setPublishState = useChatStore((s) => s.setPublishState)
  const currentCode = useChatStore((s) => s.currentCode)

  useEffect(() => {
    if (publishState === 'published') {
      const timer = setTimeout(() => {
        setPublishState('hidden')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [publishState, setPublishState])

  async function handleShare() {
    setPublishState('publishing')
    try {
      await window.electron.invoke('server:publish', {
        name: 'Untitled Component',
        description: 'A CSlate component',
        tags: [],
        source: { 'ui.tsx': currentCode ?? '' },
      })
      setPublishState('published')
    } catch (error) {
      console.error('Failed to publish:', error)
      setPublishState('prompting')
    }
  }

  function handleDecline() {
    setPublishState('declined')
  }

  if (publishState === 'hidden' || publishState === 'declined') {
    return null
  }

  if (publishState === 'published') {
    return (
      <div className="mx-3 mb-2 p-3 bg-green-500/10 border border-green-500/30 rounded-md">
        <div className="flex items-center gap-2 text-sm text-green-600">
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

  // publishState === 'prompting'
  return (
    <div className="mx-3 mb-2 p-3 bg-surface border border-border rounded-md">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-text">Share with the CSlate community?</span>
        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            className="px-3 py-1 text-xs text-muted hover:text-text border border-border rounded-md transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleShare}
            className="px-3 py-1 text-xs text-white bg-primary rounded-md hover:opacity-90 transition-opacity"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  )
}
