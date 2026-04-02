import React from 'react'
import ReactDOM from 'react-dom'
import { ComponentError } from './ComponentError'

interface Props {
  bundle: string
}

interface EvalResult {
  Component: React.ComponentType | null
  error: string | null
}

function createBridge() {
  return {
    pipeline: async (pipelineId: string) => {
      try {
        return await window.electron.invoke('pipeline:get-data', { pipelineId })
      } catch (err) {
        console.error('[bridge] pipeline fetch failed:', err)
        return { data: null, metadata: { fetchedAt: 0, source: 'error', cached: false }, error: String(err) }
      }
    },

    pipelineSubscribe: (pipelineId: string, callback: (data: unknown) => void) => {
      try {
        window.electron.send('pipeline:subscribe', { pipelineId })
      } catch (err) {
        console.error('[bridge] pipeline subscribe failed:', err)
        return () => {}
      }

      const removeListener = window.electron.on('pipeline:data', (msg: unknown) => {
        const typed = msg as { pipelineId: string; data: unknown }
        if (typed.pipelineId === pipelineId) {
          callback(typed.data)
        }
      })

      return () => {
        window.electron.send('pipeline:unsubscribe', { pipelineId })
        removeListener()
      }
    },
  }
}

function evalBundle(bundle: string): EvalResult {
  try {
    const _module = { exports: {} as Record<string, unknown> }
    const bridge = createBridge()
    const _require = (mod: string): unknown => {
      if (mod === 'react') return React
      if (mod === 'react-dom') return ReactDOM
      // Support automatic JSX transform — esbuild may emit require('react/jsx-runtime')
      // even with jsx:'transform' if source code imports it explicitly
      if (mod === 'react/jsx-runtime' || mod === 'react/jsx-dev-runtime') {
        return {
          jsx: React.createElement,
          jsxs: React.createElement,
          jsxDEV: React.createElement,
          Fragment: React.Fragment,
        }
      }
      if (mod === 'bridge') return bridge
      throw new Error(
        `Module "${mod}" is not available in the CSlate sandbox. ` +
        `Use bridge.pipeline() for pipeline data, or bridge.fetch() for external data.`
      )
    }

    // eslint-disable-next-line no-new-func
    const factory = new Function('require', 'module', 'exports', bundle)
    factory(_require, _module, _module.exports)

    const Component = _module.exports['default'] as React.ComponentType | undefined
    if (typeof Component !== 'function') {
      return {
        Component: null,
        error:
          'No default export found. ' +
          'Your ui.tsx must have: export default function MyComponent() { ... }',
      }
    }
    return { Component, error: null }
  } catch (e) {
    return { Component: null, error: `Failed to evaluate: ${String(e)}` }
  }
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError(e: Error): void },
  { caught: boolean }
> {
  state = { caught: false }
  static getDerivedStateFromError() { return { caught: true } }
  componentDidCatch(e: Error) { this.props.onError(e) }
  render() { return this.state.caught ? null : this.props.children }
}

export function DynamicComponent({ bundle }: Props) {
  const [result, setResult] = React.useState<EvalResult>({ Component: null, error: null })
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setRuntimeError(null)
    setResult(evalBundle(bundle))
  }, [bundle])

  if (result.error) return <ComponentError message={result.error} code={bundle} />
  if (runtimeError) return <ComponentError message={`Runtime: ${runtimeError}`} code={bundle} />
  if (!result.Component) return null

  return (
    <ErrorBoundary key={bundle} onError={(e) => setRuntimeError(e.message)}>
      <result.Component />
    </ErrorBoundary>
  )
}
