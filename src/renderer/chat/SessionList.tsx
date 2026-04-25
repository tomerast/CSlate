import React, { useEffect, useMemo, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { sessionsApi } from './sessions-api'
import type { SessionSummary } from '@shared/agentTypes'

interface SessionListProps {
  onNewSession: () => void
  onLoadSession: (id: string) => void | Promise<void>
}

type Group = { label: string; items: SessionSummary[] }

const DAY_MS = 24 * 60 * 60 * 1000

function groupByRecency(sessions: SessionSummary[]): Group[] {
  const now = Date.now()
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  const startOfYesterday = startOfToday - DAY_MS
  const startOfWeek = startOfToday - 6 * DAY_MS

  const groups: Record<string, SessionSummary[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  }

  for (const s of sessions) {
    if (s.updatedAt >= startOfToday) groups['Today'].push(s)
    else if (s.updatedAt >= startOfYesterday) groups['Yesterday'].push(s)
    else if (s.updatedAt >= startOfWeek) groups['This week'].push(s)
    else groups['Earlier'].push(s)
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export function SessionList({ onNewSession, onLoadSession }: SessionListProps) {
  const sessions = useChatStore((s) => s.sessions)
  const setSessions = useChatStore((s) => s.setSessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SessionSummary[] | null>(null)

  useEffect(() => {
    sessionsApi.list().then(setSessions).catch(() => {})
  }, [setSessions])

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null)
      return
    }
    const handle = setTimeout(() => {
      sessionsApi.search(query).then(setSearchResults).catch(() => setSearchResults([]))
    }, 150)
    return () => clearTimeout(handle)
  }, [query])

  const visible = searchResults ?? sessions
  const groups = useMemo(() => groupByRecency(visible), [visible])

  const handleDelete = async (id: string, title: string) => {
    const confirmed = window.confirm(
      `Delete "${title}"?\n\nThis can't be undone. The cards in this conversation stay in your component library.`,
    )
    if (!confirmed) return
    await sessionsApi.delete(id)
    const list = await sessionsApi.list()
    setSessions(list)
    if (activeSessionId === id) onNewSession()
  }

  if (sidebarCollapsed) {
    return (
      <div className="w-12 flex-shrink-0 border-r border-white/[0.045] bg-background/80 backdrop-blur-xl flex flex-col items-center pt-12 pb-3 gap-2 relative z-10">
        <IconButton onClick={toggleSidebar} title="Expand sidebar (⌘B)">
          <ChevronRightIcon />
        </IconButton>
        <IconButton onClick={onNewSession} title="New conversation">
          <PlusIcon />
        </IconButton>
      </div>
    )
  }

  return (
    <aside className="w-72 flex-shrink-0 border-r border-white/[0.045] bg-background/82 backdrop-blur-xl flex flex-col relative z-10">
      <div className="flex items-center gap-1 px-3 pb-3 pt-12 border-b border-white/[0.045]">
        <button
          onClick={onNewSession}
          className="flex-1 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-sm text-text/88 hover:bg-white/[0.045] transition-colors"
        >
          <PlusIcon />
          <span>New conversation</span>
        </button>
        <IconButton onClick={toggleSidebar} title="Collapse sidebar (⌘B)">
          <ChevronLeftIcon />
        </IconButton>
      </div>

      <div className="p-3 border-b border-white/[0.045]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations"
          className="w-full rounded-lg border border-white/[0.045] bg-white/[0.025] px-3 py-2 text-xs text-text placeholder:text-muted/48 focus:border-white/[0.10] focus:outline-none focus:bg-white/[0.04] transition-colors"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="px-4 py-6 text-xs text-muted/60">No conversations yet.</div>
        )}
        {groups.map((group) => (
          <div key={group.label} className="py-2">
            <div className="px-4 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted/45">
              {group.label}
            </div>
            <ul>
              {group.items.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onClick={() => void onLoadSession(session.id)}
                  onDelete={() => void handleDelete(session.id, session.title)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}

interface SessionRowProps {
  session: SessionSummary
  active: boolean
  onClick: () => void
  onDelete: () => void
}

function SessionRow({ session, active, onClick, onDelete }: SessionRowProps) {
  const date = new Date(session.updatedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <li>
      <div
        className={[
          'group mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-all duration-150',
          active ? 'bg-white/[0.055] text-text' : 'text-muted/78 hover:text-text hover:bg-white/[0.032]',
        ].join(' ')}
        onClick={onClick}
      >
        <span
          className={[
            'h-7 w-px rounded-full shrink-0 transition-colors',
            active ? 'bg-text/70' : 'bg-white/[0.10] group-hover:bg-white/[0.20]',
          ].join(' ')}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-current">{session.title}</div>
          <div className="mt-0.5 text-[10px] text-muted/40">{date}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="grid h-7 w-7 place-items-center rounded-lg opacity-0 group-hover:opacity-100 text-muted/55 hover:text-error hover:bg-error/[0.08] transition-all"
          title="Delete"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </li>
  )
}

function IconButton({
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
      className="grid h-8 w-8 place-items-center rounded-lg text-muted/72 hover:bg-white/[0.045] hover:text-text transition-colors"
    >
      {children}
    </button>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}
