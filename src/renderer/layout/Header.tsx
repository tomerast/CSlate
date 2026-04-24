import React from 'react'
import { useAppStore } from '../store/appStore'
import { ProviderLens } from '../components/ProviderLens'

interface HeaderProps {
  modelId: string
  onOpenConfig: () => void
  onOpenMemory: () => void
}

export function Header({ modelId, onOpenConfig, onOpenMemory }: HeaderProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const activeProvider = useAppStore((s) => s.activeProvider)
  const setActiveProvider = useAppStore((s) => s.setActiveProvider)

  return (
    <header className="h-12 flex-shrink-0 flex items-center px-4 app-drag-region"
    >
      <div
        className="flex items-center gap-3 flex-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={toggleSidebar}
          title="Toggle sidebar (⌘B)"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-text hover:bg-white/[0.04] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <span className="text-[11px] font-semibold text-muted/30 tracking-widest uppercase">
          CSlate
        </span>
      </div>

      <div className="hidden md:flex items-center justify-center flex-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-[11px] text-muted/20 tracking-wider">
          The Visual Bridge
        </span>
      </div>

      <div
        className="flex items-center gap-2 flex-1 justify-end"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ProviderLens
          activeProvider={activeProvider}
          onChange={setActiveProvider}
          size="sm"
        />

        <HeaderButton onClick={onOpenMemory} title="Memory (⌘M)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 0-5 5v3a4 4 0 0 0-3 3.87V17a4 4 0 0 0 4 4h.5" />
            <path d="M12 2a5 5 0 0 1 5 5v3a4 4 0 0 1 3 3.87V17a4 4 0 0 1-4 4h-.5" />
            <path d="M12 7v14" />
          </svg>
        </HeaderButton>

        <HeaderButton onClick={onOpenConfig} title="Settings (⌘,)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.5} />
            <path
              d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </svg>
        </HeaderButton>
      </div>
    </header>
  )
}

function HeaderButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-text hover:bg-white/[0.04] transition-colors"
    >
      {children}
    </button>
  )
}
