/**
 * DynamicComponent — runs CJS bundles inside the renderer via `new Function()`.
 *
 * SECURITY MODEL
 * Bundles reach this component from two sources only, both assumed trusted:
 *   1. The CSlate server library, which runs every upload through the
 *      7-stage review pipeline (static analysis + agent review + red-team)
 *      before it can be fetched by `CSlateServerClient`.
 *   2. The local orchestrator, which invokes `writeComponent` after
 *      `validateComponentPackage` + esbuild succeed.
 *
 * There is no client-side sandbox beyond the require-shim below (React /
 * bridge / JSX runtime allowed; everything else throws). Do NOT pipe bundles
 * from arbitrary URLs, user paste, or unvetted servers into this component.
 */
import React from 'react'
import ReactDOM from 'react-dom'
import { ComponentError } from './ComponentError'
import { useAppStore, type UserPreferences } from '../store/appStore'

type Variant = 'inline' | 'fullscreen'

interface Props {
  bundle: string
  variant?: Variant
}

interface EvalResult {
  Component: React.ComponentType | null
  error: string | null
}

interface UserBridge {
  theme: UserPreferences['theme']
  density: UserPreferences['density']
  preferences: Record<string, unknown>
}

interface Bridge {
  user: UserBridge
  fetch: (sourceId: string, endpointId: string, params?: Record<string, unknown>) => Promise<unknown>
  subscribe: (
    sourceId: string,
    endpointId: string,
    params: Record<string, unknown>,
    callback: (data: unknown) => void,
  ) => () => void
  getConfig: (key: string) => unknown
  pipeline: (pipelineId: string) => Promise<unknown>
  pipelineSubscribe: (pipelineId: string, callback: (data: unknown) => void) => () => void
}

function createBridge(preferences: UserPreferences): Bridge {
  return {
    user: {
      theme: preferences.theme,
      density: preferences.density,
      preferences: preferences.extras,
    },

    fetch: async (sourceId, endpointId) => {
      console.warn(
        `[bridge.fetch] "${sourceId}/${endpointId}" — data source registry not yet available, returning null`,
      )
      return null
    },

    subscribe: (sourceId, endpointId) => {
      console.warn(
        `[bridge.subscribe] "${sourceId}/${endpointId}" — data source registry not yet available`,
      )
      return () => {}
    },

    getConfig: (key) => {
      console.warn(`[bridge.getConfig] "${key}" — config not yet available`)
      return undefined
    },

    pipeline: async (pipelineId) => {
      try {
        return await window.electron.invoke('pipeline:get-data', { pipelineId })
      } catch (err) {
        console.error('[bridge] pipeline fetch failed:', err)
        return {
          data: null,
          metadata: { fetchedAt: 0, source: 'error', cached: false },
          error: String(err),
        }
      }
    },

    pipelineSubscribe: (pipelineId, callback) => {
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

function evalBundle(bundle: string, bridge: Bridge): EvalResult {
  try {
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string): unknown => {
      if (mod === 'react') return React
      if (mod === 'react-dom') return ReactDOM
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
          `Use bridge.pipeline() for pipeline data, or bridge.fetch() for external data.`,
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
  static getDerivedStateFromError() {
    return { caught: true }
  }
  componentDidCatch(e: Error) {
    this.props.onError(e)
  }
  render() {
    return this.state.caught ? null : this.props.children
  }
}

function createComponentStore() {
  const state: Record<string, unknown> = {}
  return {
    getState: (key: string) => state[key],
    setState: (keyOrPatch: string | Record<string, unknown>, value?: unknown) => {
      if (typeof keyOrPatch === 'string') {
        state[keyOrPatch] = value
      } else {
        Object.assign(state, keyOrPatch)
      }
    },
    get: (key: string) => state[key],
  }
}

// Module-level cache: same bundle string → same Component reference.
const bundleCache = new Map<string, EvalResult>()
const MAX_CACHE_SIZE = 50

function evalBundleCached(bundle: string, bridge: Bridge): EvalResult {
  const cached = bundleCache.get(bundle)
  if (cached) return cached
  const result = evalBundle(bundle, bridge)
  if (bundleCache.size >= MAX_CACHE_SIZE) {
    const first = bundleCache.keys().next().value
    if (first !== undefined) bundleCache.delete(first)
  }
  bundleCache.set(bundle, result)
  return result
}

/**
 * Render a component bundle inline in the chat (default) or as a fullscreen
 * embed. The inline variant is constrained to the message bubble width and
 * has internal scroll if content overflows.
 */
export function DynamicComponent({ bundle, variant = 'inline' }: Props) {
  const preferences = useAppStore((s) => s.preferences)
  const [result, setResult] = React.useState<EvalResult>({ Component: null, error: null })
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null)
  const bridgeRef = React.useRef<Bridge>(createBridge(preferences))
  const storeRef = React.useRef(createComponentStore())

  // Keep bridge.user fresh as preferences change without breaking cached bundles.
  React.useEffect(() => {
    bridgeRef.current.user = {
      theme: preferences.theme,
      density: preferences.density,
      preferences: preferences.extras,
    }
  }, [preferences])

  React.useEffect(() => {
    setRuntimeError(null)
    setResult(evalBundleCached(bundle, bridgeRef.current))
  }, [bundle])

  if (result.error) return <ComponentError message={result.error} code={bundle} />
  if (runtimeError) return <ComponentError message={`Runtime: ${runtimeError}`} code={bundle} />
  if (!result.Component) return null

  const Comp = result.Component as React.ComponentType<{ bridge?: unknown; store?: unknown }>

  const wrapperClass =
    variant === 'inline'
      ? 'w-full max-h-[480px] overflow-auto rounded-xl border border-border bg-surface/60 shadow-sm'
      : 'relative w-full h-full'

  return (
    <div className={wrapperClass}>
      <ErrorBoundary key={bundle} onError={(e) => setRuntimeError(e.message)}>
        <Comp bridge={bridgeRef.current} store={storeRef.current} />
      </ErrorBoundary>
    </div>
  )
}
