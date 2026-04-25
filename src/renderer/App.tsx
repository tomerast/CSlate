import React, { useCallback, useEffect, useState, Component } from 'react'
import type { ReactNode } from 'react'
import { useAppStore } from './store/appStore'
import { AppLayout } from './layout/AppLayout'
import CSlateConfigPanel from './components/cslate-config-panel/ui'
import { MemoryPanel } from './settings/MemoryPanel'
import type { ConfigValues, Theme, LLMProvider } from './components/cslate-config-panel/types'

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center h-full bg-background">
            <div className="max-w-md p-6 bg-surface border border-error/30 rounded-lg text-center">
              <h2 className="text-lg font-semibold text-error mb-2">Something broke</h2>
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
      )
    }
    return this.props.children
  }
}

export default function App() {
  const {
    configOpen,
    configFocusTab,
    memoryOpen,
    openConfig,
    closeConfig,
    openMemory,
    closeMemory,
    setPreferences,
  } = useAppStore()
  const [config, setConfig] = useState({
    llmProvider: 'anthropic' as LLMProvider,
    llmModel: 'anthropic/claude-sonnet-4-6',
    llmFastModel: 'anthropic/claude-haiku-4-5',
    llmApiKey: '',
    gatewayUrl: 'https://openrouter.ai/api/v1',
    theme: 'dark' as Theme,
    serverUrl: 'http://localhost:3000',
    serverEmail: '',
  })

  useEffect(() => {
    async function loadConfig() {
      if (!window.electron) return
      try {
        const [llmProvider, llmModel, llmFastModel, llmApiKey, gatewayUrl, theme, serverUrl, serverEmail] = await Promise.all([
          window.electron.invoke('config:get', 'llmProvider'),
          window.electron.invoke('config:get', 'llmModel'),
          window.electron.invoke('config:get', 'llmFastModel'),
          window.electron.invoke('config:get', 'llmApiKey'),
          window.electron.invoke('config:get', 'gatewayUrl'),
          window.electron.invoke('config:get', 'theme'),
          window.electron.invoke('config:get', 'serverUrl'),
          window.electron.invoke('config:get', 'serverEmail'),
        ])
        setConfig((prev) => ({
          llmProvider: ((llmProvider as LLMProvider) || prev.llmProvider) as LLMProvider,
          llmModel: (llmModel as string) || prev.llmModel,
          llmFastModel: (llmFastModel as string) || prev.llmFastModel,
          llmApiKey: (llmApiKey as string) || prev.llmApiKey,
          gatewayUrl: (gatewayUrl as string) || prev.gatewayUrl,
          theme: ((theme as Theme) || prev.theme) as Theme,
          serverUrl: (serverUrl as string) || prev.serverUrl,
          serverEmail: (serverEmail as string) || prev.serverEmail,
        }))
        if (theme && theme !== 'dark') {
          document.documentElement.setAttribute('data-theme', theme as string)
        }
        setPreferences({ theme: (theme as Theme) || 'dark' })
      } catch (err) {
        console.warn('Failed to load config from main process:', err)
      }
    }
    loadConfig()
  }, [])

  const handleOutput = useCallback((key: keyof ConfigValues, value: string) => {
    if (!window.electron) return
    window.electron.invoke('config:set', { key, value }).catch(console.warn)
    setConfig((prev) => ({ ...prev, [key]: value }))
    if (key === 'theme') {
      if (value === 'dark') {
        document.documentElement.removeAttribute('data-theme')
      } else {
        document.documentElement.setAttribute('data-theme', value)
      }
      setPreferences({ theme: value as Theme })
    }
  }, [])

  const handleEvent = useCallback(
    (event: string) => {
      if (event === 'config:closed') closeConfig()
    },
    [closeConfig],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        configOpen ? closeConfig() : openConfig()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        memoryOpen ? closeMemory() : openMemory()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [configOpen, openConfig, closeConfig, memoryOpen, openMemory, closeMemory])

  return (
    <ErrorBoundary>
      <AppLayout
        onOpenConfig={() => openConfig()}
        onOpenMemory={() => openMemory()}
        modelId={config.llmModel}
      />
      <ErrorBoundary>
        <CSlateConfigPanel
          isOpen={configOpen}
          focusTab={configFocusTab}
          llmProvider={config.llmProvider}
          llmModel={config.llmModel}
          llmFastModel={config.llmFastModel}
          llmApiKey={config.llmApiKey}
          gatewayUrl={config.gatewayUrl}
          theme={config.theme}
          serverUrl={config.serverUrl}
          serverEmail={config.serverEmail}
          onOutput={handleOutput}
          onEvent={handleEvent}
        />
      </ErrorBoundary>
      <ErrorBoundary>
        <MemoryPanel isOpen={memoryOpen} onClose={closeMemory} />
      </ErrorBoundary>
    </ErrorBoundary>
  )
}
