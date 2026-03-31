// src/renderer/canvas/building/PartialPreview.tsx
import React from 'react'
import { DynamicComponent } from '../../sandbox/DynamicComponent'

interface Props {
  bundle?: string
  source?: string
}

class BundleErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function CodeBlock({ source }: { source: string }) {
  const lines = source.split('\n').slice(0, 25)
  return (
    <pre className="text-[10px] font-mono text-muted/70 overflow-hidden leading-relaxed p-2 bg-background/50 rounded border border-border/30">
      {lines.join('\n')}
      {source.split('\n').length > 25 && '\n…'}
    </pre>
  )
}

export function PartialPreview({ bundle, source }: Props) {
  if (!bundle && !source) return null

  return (
    <div className="mt-1 rounded border border-primary/20 overflow-hidden">
      <div className="px-2 py-1 bg-primary/5 border-b border-primary/10">
        <span className="text-[10px] text-primary/60 font-medium">Preview</span>
      </div>
      <div className="max-h-48 overflow-auto">
        {bundle ? (
          <BundleErrorBoundary fallback={source ? <CodeBlock source={source} /> : null}>
            <div className="p-2">
              <DynamicComponent bundle={bundle} />
            </div>
          </BundleErrorBoundary>
        ) : source ? (
          <CodeBlock source={source} />
        ) : null}
      </div>
    </div>
  )
}
