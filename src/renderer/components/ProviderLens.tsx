import { useState, useRef, useEffect } from 'react'
import { getProviderMeta, type ProviderId } from '../store/appStore'

const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'google', 'local']

interface ProviderLensProps {
  activeProvider: ProviderId
  onChange: (provider: ProviderId) => void
  size?: 'sm' | 'md'
}

export function ProviderLens({ activeProvider, onChange, size = 'md' }: ProviderLensProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const meta = getProviderMeta(activeProvider)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  const pillSize = size === 'sm'
    ? 'text-[11px] px-2 py-0.5 h-6 gap-1'
    : 'text-xs px-2.5 py-1 h-7 gap-1.5'

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`
          inline-flex items-center rounded-full border border-white/[0.08]
          bg-surface/80 backdrop-blur-sm text-text
          hover:bg-overlay transition-all duration-200
          ${pillSize}
        `}
      >
        <span
          className={`rounded-full ${dotSize}`}
          style={{ backgroundColor: meta.color }}
        />
        <span className="font-medium">{meta.name}</span>
        <svg className="w-3 h-3 text-muted ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="
            absolute top-full left-0 mt-1.5 z-50
            min-w-[220px] rounded-xl border border-white/[0.08]
            bg-surface/95 backdrop-blur-xl
            shadow-lg p-1.5
          "
        >
          {PROVIDERS.map((pid) => {
            const pm = getProviderMeta(pid)
            const sel = pid === activeProvider
            return (
              <button
                key={pid}
                onClick={() => {
                  onChange(pid)
                  setOpen(false)
                }}
                className={`
                  w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left
                  transition-colors duration-150
                  cursor-pointer
                  ${sel ? 'bg-white/5' : 'hover:bg-white/[0.03]'}
                `}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: pm.color }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text truncate">{pm.name}</div>
                  <div className="text-[11px] text-muted truncate">{pid}</div>
                </div>
                {sel && (
                  <svg className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: pm.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
