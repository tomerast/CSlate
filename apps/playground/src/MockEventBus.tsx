import React, { useEffect, useState } from 'react'

type EventEntry = { ts: string; name: string; payload: unknown }

const listeners = new Map<string, Set<(payload: unknown) => void>>()
const log: EventEntry[] = []
const logListeners = new Set<() => void>()

export const mockEventBus = {
  emit(name: string, payload: unknown) {
    const ts = new Date().toISOString().split('T')[1].slice(0, 12)
    log.unshift({ ts, name, payload })
    if (log.length > 50) log.pop()
    logListeners.forEach(fn => fn())
    listeners.get(name)?.forEach(fn => fn(payload))
  },
  on(name: string, fn: (payload: unknown) => void) {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name)!.add(fn)
    return () => listeners.get(name)?.delete(fn)
  }
}

export function EventLog(): React.ReactElement {
  const [entries, setEntries] = useState<EventEntry[]>([...log])

  useEffect(() => {
    const refresh = () => setEntries([...log])
    logListeners.add(refresh)
    return () => { logListeners.delete(refresh) }
  }, [])

  return (
    <div style={{ padding: '12px', borderTop: '1px solid var(--slate-border)', fontSize: '12px', fontFamily: 'monospace' }}>
      <div style={{ color: 'var(--slate-text-muted)', marginBottom: '8px', fontFamily: 'system-ui', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event Bus</div>
      {entries.length === 0 && <div style={{ color: 'var(--slate-text-muted)', fontStyle: 'italic' }}>No events yet</div>}
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: '4px' }}>
          <span style={{ color: 'var(--slate-text-muted)' }}>{e.ts} </span>
          <span style={{ color: 'var(--slate-success)' }}>{e.name}</span>
          <span style={{ color: 'var(--slate-text-muted)' }}> {JSON.stringify(e.payload)}</span>
        </div>
      ))}
    </div>
  )
}
