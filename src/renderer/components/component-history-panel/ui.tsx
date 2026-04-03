import React from 'react'
import { useHistory, type HistoryComponent } from '../../hooks/useHistory'

interface ComponentHistoryPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function ComponentHistoryPanel({ isOpen, onClose }: ComponentHistoryPanelProps): React.ReactElement | null {
  if (!isOpen) return null

  const { components, loading, resumeComponent } = useHistory()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[560px] max-h-[92vh] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text">Component History</h2>
            <p className="text-xs text-muted mt-0.5">All components you've built in this project</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-background/80 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted text-sm">
              Loading components...
            </div>
          )}

          {!loading && components.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted text-sm">No components yet</p>
              <p className="text-muted/50 text-xs mt-1">Components you build will appear here</p>
            </div>
          )}

          {!loading && components.map((comp) => (
            <ComponentCard
              key={comp.componentId}
              component={comp}
              onContinue={() => resumeComponent(comp.componentId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface ComponentCardProps {
  component: HistoryComponent
  onContinue: () => void
}

function ComponentCard({ component, onContinue }: ComponentCardProps) {
  const { manifest, onCanvas, lastEditedAt, sessionIds } = component

  const lastEdited = new Date(lastEditedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border hover:border-border/80 hover:bg-background/40 transition-all">
      {/* Thumbnail placeholder */}
      <div className="w-14 h-14 rounded-md bg-background border border-border flex-shrink-0 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-muted/30">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text truncate">{manifest.name}</span>
          {onCanvas && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full border border-primary/20 flex-shrink-0">
              On canvas
            </span>
          )}
        </div>
        {manifest.description && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2">{manifest.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {manifest.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-background border border-border rounded text-muted">
              {tag}
            </span>
          ))}
          <span className="text-[10px] text-muted/50 ml-auto flex-shrink-0">
            {lastEdited}{sessionIds.length > 0 ? ` · ${sessionIds.length} session${sessionIds.length !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all shadow-sm shadow-primary/20"
      >
        Continue
      </button>
    </div>
  )
}
