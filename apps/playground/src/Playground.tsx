import React from 'react'
import { StoreInspector } from './MockStore'
import { EventLog } from './MockEventBus'

interface Props {
  componentName: string | null
}

export function Playground({ componentName }: Props): React.ReactElement {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Main canvas */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', background: 'var(--slate-bg)' }}>
        {componentName ? (
          <div style={{ background: 'var(--slate-surface)', borderRadius: '8px', padding: '16px', minWidth: 300, minHeight: 200, boxShadow: 'var(--slate-shadow-md)' }}>
            <div style={{ color: 'var(--slate-text-muted)', fontSize: '14px', textAlign: 'center' }}>
              Loading <code style={{ color: 'var(--slate-primary)' }}>{componentName}</code>...
            </div>
            <div style={{ color: 'var(--slate-text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
              (Component rendering will be wired in Plan 03)
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--slate-text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎨</div>
            <div style={{ fontSize: '14px' }}>
              Open a component with{' '}
              <code style={{ background: 'var(--slate-surface)', padding: '2px 6px', borderRadius: '4px', color: 'var(--slate-primary)' }}>?component=name</code>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div style={{ width: '288px', borderLeft: '1px solid var(--slate-border)', background: 'var(--slate-surface)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '12px', borderBottom: '1px solid var(--slate-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--slate-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Component Playground</div>
          {componentName && (
            <div style={{ fontSize: '14px', color: 'var(--slate-primary)', fontFamily: 'monospace', marginTop: '4px' }}>{componentName}</div>
          )}
        </div>
        <StoreInspector />
        <EventLog />
      </div>
    </div>
  )
}
