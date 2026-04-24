import React, { useEffect, useState, useCallback } from 'react'
import { memoryApi, type MemoryEntry } from './memory-api'

interface MemoryPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [activeName, setActiveName] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!isOpen) return
    memoryApi
      .list()
      .then((list) => {
        setEntries(list)
        setActiveName((prev) => prev ?? list[0]?.name ?? null)
      })
      .catch(() => setEntries([]))
  }, [isOpen])

  useEffect(() => {
    if (!activeName) return
    const entry = entries.find((e) => e.name === activeName)
    if (entry) {
      setDraft(entry.content)
      setStatus('idle')
    }
  }, [activeName, entries])

  const handleSave = useCallback(async () => {
    if (!activeName) return
    setStatus('saving')
    try {
      const updated = await memoryApi.write(activeName, draft)
      if (updated) {
        setEntries((prev) => prev.map((e) => (e.name === updated.name ? updated : e)))
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 1200)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }, [activeName, draft])

  if (!isOpen) return null

  const active = entries.find((e) => e.name === activeName) ?? null
  const dirty = active ? active.content !== draft : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[88vh] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex">
        <aside className="w-56 border-r border-border bg-background/40 flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted/60">
              Memory
            </div>
            <div className="mt-0.5 text-xs text-muted">
              Files the assistant reads on every turn.
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto py-2">
            {entries.map((entry) => (
              <li key={entry.name}>
                <button
                  onClick={() => setActiveName(entry.name)}
                  className={[
                    'w-full text-left px-4 py-2 text-xs transition-colors',
                    entry.name === activeName
                      ? 'bg-primary/10 text-text'
                      : 'text-muted hover:bg-surface hover:text-text',
                  ].join(' ')}
                >
                  <div className="font-medium">{entry.label}</div>
                  <div className="text-muted/60 text-[10px] mt-0.5">
                    {formatBytes(entry.size)} · {formatRelative(entry.updatedAt)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex-1 flex flex-col min-w-0">
          <header className="flex items-start justify-between border-b border-border px-5 py-3">
            <div>
              <div className="text-sm font-medium text-text">{active?.label ?? 'Memory'}</div>
              <div className="text-xs text-muted/70 mt-0.5 max-w-prose">
                {active?.description}
              </div>
            </div>
            <button
              onClick={onClose}
              title="Close"
              className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-background hover:text-text transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full resize-none bg-background border-none px-5 py-4 text-sm font-mono text-text placeholder:text-muted/60 focus:outline-none"
            placeholder="Your notes here. Markdown is fine."
          />

          <footer className="flex items-center justify-between border-t border-border px-5 py-3 bg-background/40">
            <div className="text-xs text-muted/60">
              {status === 'saved' && 'Saved.'}
              {status === 'saving' && 'Saving…'}
              {status === 'error' && <span className="text-error">Save failed.</span>}
              {status === 'idle' && dirty && 'Unsaved changes.'}
              {status === 'idle' && !dirty && 'Up to date.'}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => active && setDraft(active.content)}
                disabled={!dirty || status === 'saving'}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-40 transition-colors"
              >
                Revert
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || status === 'saving'}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-white disabled:bg-primary/30 hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
