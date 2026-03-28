import React, { useState } from 'react'
import { create } from 'zustand'

interface SlateStore {
  [key: string]: unknown
  _set: (key: string, value: unknown) => void
  _getAll: () => Record<string, unknown>
}

export const useMockStore = create<SlateStore>((set, get) => ({
  _set(key, value) {
    set({ [key]: value })
  },
  _getAll() {
    const state = get()
    return Object.fromEntries(
      Object.entries(state).filter(([k]) => !k.startsWith('_'))
    )
  }
}))

export function StoreInspector(): React.ReactElement {
  const store = useMockStore()
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')

  const entries = store._getAll()

  const handleSet = () => {
    try {
      store._set(editKey, JSON.parse(editValue))
      setEditKey('')
      setEditValue('')
    } catch {
      store._set(editKey, editValue)
    }
  }

  return (
    <div style={{ padding: '12px', borderTop: '1px solid var(--slate-border)', fontSize: '12px', fontFamily: 'monospace' }}>
      <div style={{ color: 'var(--slate-text-muted)', marginBottom: '8px', fontFamily: 'system-ui', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Zustand Store</div>
      {Object.entries(entries).length === 0 && (
        <div style={{ color: 'var(--slate-text-muted)', fontStyle: 'italic' }}>Empty</div>
      )}
      {Object.entries(entries).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '4px' }}>
          <span style={{ color: 'var(--slate-primary)' }}>{key}</span>
          <span style={{ color: 'var(--slate-text-muted)' }}> = </span>
          <span style={{ color: 'var(--slate-text)' }}>{JSON.stringify(value)}</span>
        </div>
      ))}
      <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
        <input
          value={editKey}
          onChange={e => setEditKey(e.target.value)}
          placeholder="key"
          style={{ flex: 1, background: 'var(--slate-surface)', border: '1px solid var(--slate-border)', borderRadius: '4px', padding: '2px 4px', color: 'var(--slate-text)', fontSize: '12px' }}
        />
        <input
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          placeholder="value (JSON)"
          style={{ flex: 1, background: 'var(--slate-surface)', border: '1px solid var(--slate-border)', borderRadius: '4px', padding: '2px 4px', color: 'var(--slate-text)', fontSize: '12px' }}
        />
        <button
          onClick={handleSet}
          style={{ background: 'var(--slate-primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', cursor: 'pointer' }}
        >
          Set
        </button>
      </div>
    </div>
  )
}
