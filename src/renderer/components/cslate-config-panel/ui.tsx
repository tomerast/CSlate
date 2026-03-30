import React from 'react'
import type { ConfigPanelProps, ConfigTab } from './types'
import { THEME_OPTIONS, PROVIDER_PRESETS, MODEL_SUGGESTIONS } from './types'
import { useConfigForm } from './logic'

export default function CSlateConfigPanel(props: ConfigPanelProps): React.ReactElement | null {
  if (!props.isOpen) return null

  const {
    values,
    showApiKey,
    setShowApiKey,
    updateField,
    hasChanges,
    handleSave,
    handleClose,
    selectTheme,
    selectProvider,
    selectModel,
    activeProvider,
    maskApiKey,
    activeTab,
    setActiveTab,
    showSuggestions,
    setShowSuggestions,
  } = useConfigForm(props)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-[560px] max-h-[92vh] bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-text">Settings</h2>
            <p className="text-xs text-muted mt-0.5">Configure your CSlate environment</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-background/80 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="px-6 pt-4">
          <div className="flex gap-1 p-1 bg-background rounded-lg mb-1">
            {(['theme', 'models', 'settings'] as ConfigTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md capitalize transition-all
                  ${activeTab === tab ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

          {/* ── Theme tab ─────────────────────────────────── */}
          {activeTab === 'theme' && (
            <section>
              <SectionHeader title="Theme" subtitle="Choose your visual style" />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => selectTheme(opt.value)}
                    className={`flex flex-col items-center gap-2 px-3 py-3 rounded-lg border transition-all ${
                      values.theme === opt.value
                        ? 'border-primary bg-primary/8 ring-1 ring-primary/25'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <ThemePreview theme={opt.value} active={values.theme === opt.value} />
                    <div className="text-center">
                      <span className="text-xs font-medium text-text">{opt.label}</span>
                      <p className="text-[10px] text-muted">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Models tab ────────────────────────────────── */}
          {activeTab === 'models' && (
            <section>
              {/* Provider pills */}
              <div className="mb-4">
                <p className="text-xs text-muted mb-2">Quick connect</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROVIDER_PRESETS.map(p => (
                    <button key={p.id} onClick={() => selectProvider(p.url)}
                      className={`px-3 py-1 text-xs font-medium rounded-full border transition-all
                        ${activeProvider?.id === p.id
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-muted hover:border-primary/40 hover:text-text'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Base URL */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-muted mb-1.5">Base URL</label>
                <input type="text" value={values.gatewayUrl}
                  onChange={e => updateField('gatewayUrl', e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 font-mono" />
              </div>

              {/* API Key */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-muted mb-1.5">API Key</label>
                <div className="relative">
                  <input type={showApiKey ? 'text' : 'password'}
                    value={showApiKey ? values.llmApiKey : maskApiKey(values.llmApiKey)}
                    onChange={e => updateField('llmApiKey', e.target.value)}
                    onFocus={() => setShowApiKey(true)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2.5 pr-10 text-sm bg-background border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 font-mono" />
                  <button onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-text">
                    {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <p className="text-[11px] text-muted/50 mt-1">Encrypted via OS keychain. Never leaves your machine.</p>
              </div>

              {/* Model */}
              <div className="relative">
                <label className="block text-xs font-medium text-muted mb-1.5">Model</label>
                <input type="text"
                  value={values.llmModel}
                  onChange={e => { updateField('llmModel', e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="anthropic/claude-sonnet-4-6"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 font-mono" />

                {showSuggestions && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {MODEL_SUGGESTIONS
                      .filter(m => !values.llmModel || m.id.includes(values.llmModel) || m.label.toLowerCase().includes(values.llmModel.toLowerCase()))
                      .map(m => (
                        <button key={m.id}
                          onMouseDown={() => selectModel(m.id)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-background/60 transition-colors">
                          <div>
                            <span className="text-sm font-mono text-text">{m.id}</span>
                            {m.note && <span className="ml-2 text-[10px] text-muted">{m.note}</span>}
                          </div>
                          {values.llmModel === m.id && <CheckIcon />}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Settings tab ──────────────────────────────── */}
          {activeTab === 'settings' && (
            <section>
              <SectionHeader title="Community Server" subtitle="Connect to CSlate's component library" />
              <div className="mt-3">
                <input
                  type="text"
                  value={values.serverUrl}
                  onChange={e => updateField('serverUrl', e.target.value)}
                  placeholder="https://api.cslate.app"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 font-mono"
                />
                <p className="text-[11px] text-muted/50 mt-1.5">
                  For searching community blueprints and uploading components.
                </p>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface/80 backdrop-blur-sm">
          <span className="text-xs text-muted font-mono">
            {hasChanges ? values.llmModel : 'No changes'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-muted hover:text-text rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="px-5 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm shadow-primary/20"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ── Sub-components ─────────────────────────────────────── */

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <p className="text-xs text-muted mt-0.5">{subtitle}</p>
    </div>
  )
}

function CheckIcon() {
  return (
    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M2.5 5.5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function ThemePreview({ theme, active }: { theme: string; active: boolean }) {
  const colors = {
    dark: { bg: '#0f0f13', surface: '#1a1a23', primary: '#6366f1', text: '#e4e4ec' },
    light: { bg: '#f8f8fc', surface: '#ffffff', primary: '#4f46e5', text: '#18181b' },
    midnight: { bg: '#020617', surface: '#0f172a', primary: '#818cf8', text: '#e2e8f0' },
  }[theme] ?? { bg: '#0f0f13', surface: '#1a1a23', primary: '#6366f1', text: '#e4e4ec' }

  return (
    <div
      className={`w-full h-12 rounded overflow-hidden border ${active ? 'border-primary/50' : 'border-border'}`}
      style={{ background: colors.bg }}
    >
      <div className="flex h-full">
        <div className="w-3 h-full" style={{ background: colors.surface }} />
        <div className="flex-1 p-1.5 flex flex-col gap-1">
          <div className="h-1 w-8 rounded-full" style={{ background: colors.primary }} />
          <div className="h-1 w-12 rounded-full opacity-40" style={{ background: colors.text }} />
          <div className="h-1 w-6 rounded-full opacity-20" style={{ background: colors.text }} />
        </div>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 7s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 3l8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
