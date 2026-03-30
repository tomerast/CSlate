import React, { useEffect, useState, useCallback, Component } from 'react'
import type { ReactNode } from 'react'
import { useAppStore } from './store/appStore'
import { AppLayout } from './layout/AppLayout'
import CSlateConfigPanel from './components/cslate-config-panel/ui'
import type { ConfigValues, Theme } from './components/cslate-config-panel/types'

/* ── Error Boundary ──────────────────────────────────────── */
interface ErrorBoundaryState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-full bg-background">
          <div className="max-w-md p-6 bg-surface border border-error/30 rounded-lg text-center">
            <h2 className="text-lg font-semibold text-error mb-2">Component Error</h2>
            <p className="text-sm text-muted mb-3">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ── App ─────────────────────────────────────────────────── */
export default function App() {
  const { configOpen, configFocusTab, openConfig, closeConfig } = useAppStore()
  const [config, setConfig] = useState({
    llmModel: 'anthropic/claude-sonnet-4-6',
    llmApiKey: '',
    gatewayUrl: 'https://openrouter.ai/api/v1',
    theme: 'dark' as Theme,
    serverUrl: 'https://api.cslate.app',
  })

  useEffect(() => {
    async function loadConfig() {
      if (!window.electron) return
      try {
        const [llmModel, llmApiKey, gatewayUrl, theme, serverUrl] = await Promise.all([
          window.electron.invoke('config:get', 'llmModel'),
          window.electron.invoke('config:get', 'llmApiKey'),
          window.electron.invoke('config:get', 'gatewayUrl'),
          window.electron.invoke('config:get', 'theme'),
          window.electron.invoke('config:get', 'serverUrl'),
        ])
        setConfig(prev => {
          const next = { ...prev }
          if (llmModel) next.llmModel = llmModel as string
          if (llmApiKey) next.llmApiKey = llmApiKey as string
          if (gatewayUrl) next.gatewayUrl = gatewayUrl as string
          if (theme) next.theme = theme as Theme
          if (serverUrl) next.serverUrl = serverUrl as string
          return next
        })
        if (theme && theme !== 'dark') {
          document.documentElement.setAttribute('data-theme', theme as string)
        }
      } catch (err) {
        console.warn('Failed to load config from main process:', err)
      }
    }
    loadConfig()
  }, [])

  const handleOutput = useCallback((key: keyof ConfigValues, value: string) => {
    if (!window.electron) return
    window.electron.invoke('config:set', { key, value }).catch(console.warn)
    setConfig(prev => ({ ...prev, [key]: value }))

    if (key === 'theme') {
      if (value === 'dark') {
        document.documentElement.removeAttribute('data-theme')
      } else {
        document.documentElement.setAttribute('data-theme', value)
      }
    }
  }, [])

  const handleEvent = useCallback((event: string) => {
    if (event === 'config:closed') closeConfig()
  }, [closeConfig])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        configOpen ? closeConfig() : openConfig()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [configOpen, openConfig, closeConfig])

  return (
    <ErrorBoundary>
      <AppLayout onOpenConfig={() => openConfig()} />
      <ErrorBoundary>
        <CSlateConfigPanel
          isOpen={configOpen}
          focusTab={configFocusTab}
          llmModel={config.llmModel}
          llmApiKey={config.llmApiKey}
          gatewayUrl={config.gatewayUrl}
          theme={config.theme}
          serverUrl={config.serverUrl}
          onOutput={handleOutput}
          onEvent={handleEvent}
        />
      </ErrorBoundary>
    </ErrorBoundary>
  )
}
