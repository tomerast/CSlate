import React from 'react'
import type { ConfigPanelProps, GatewayOption } from './types'
import { MODEL_PRESETS, THEME_OPTIONS, GATEWAY_OPTIONS } from './types'
import { useConfigForm } from './logic'

export default function CSlateConfigPanel(props: ConfigPanelProps): React.ReactElement | null {
  if (!props.isOpen) return null

  const {
    values,
    showApiKey,
    setShowApiKey,
    customModel,
    setCustomModel,
    useCustomModel,
    updateField,
    hasChanges,
    handleSave,
    handleClose,
    selectModel,
    applyCustomModel,
    selectTheme,
    selectGateway,
    maskApiKey,
    selectedPreset,
    selectedGateway,
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">

          {/* ── AI Gateway ─────────────────────────────────── */}
          <section>
            <SectionHeader
              title="AI Gateway"
              subtitle="Route agent calls through your own infrastructure"
            />

            <div className="mt-2.5 px-3 py-2.5 bg-primary/5 border border-primary/10 rounded-lg">
              <p className="text-xs text-text/80 leading-relaxed">
                CSlate&apos;s agent runs on <span className="font-semibold text-text">your</span> infrastructure with <span className="font-semibold text-text">your</span> API key.
                Pick a gateway for caching, logging, and cost control — or go direct.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-1.5 mt-3">
              {GATEWAY_OPTIONS.map(gw => (
                <GatewayCard
                  key={gw.id}
                  gateway={gw}
                  selected={values.gatewayMode === gw.id}
                  onSelect={() => selectGateway(gw.id)}
                />
              ))}
            </div>

            {/* Gateway URL + docs (only when not direct) */}
            {values.gatewayMode !== 'direct' && selectedGateway && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-muted">Gateway URL</label>
                <input
                  type="text"
                  value={values.gatewayUrl}
                  onChange={e => updateField('gatewayUrl', e.target.value)}
                  placeholder={selectedGateway.defaultUrl || 'https://...'}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 font-mono"
                />
                <div className="flex items-center gap-3">
                  {selectedGateway.docsUrl && (
                    <a href={selectedGateway.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      <LinkIcon /> Docs
                    </a>
                  )}
                  {selectedGateway.signupUrl && (
                    <a href={selectedGateway.signupUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      <LinkIcon /> Sign up
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-muted/50">{selectedGateway.setupHint}</p>
              </div>
            )}
          </section>

          {/* ── AI Model ───────────────────────────────────── */}
          <section>
            <SectionHeader
              title="AI Model"
              subtitle="Choose the LLM that powers your CSlate agent"
            />

            <div className="grid grid-cols-1 gap-1.5 mt-3">
              {MODEL_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => selectModel(preset.id)}
                  className={`
                    flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-all
                    ${values.llmModel === preset.id && !useCustomModel
                      ? 'border-primary bg-primary/8 ring-1 ring-primary/25'
                      : 'border-border hover:border-primary/30 hover:bg-background/50'
                    }
                  `}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text">{preset.label}</span>
                      <TierBadge tier={preset.tier} />
                    </div>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {preset.provider} — {preset.description}
                    </p>
                  </div>
                  {values.llmModel === preset.id && !useCustomModel && <CheckIcon />}
                </button>
              ))}
            </div>

            {/* Custom model input */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyCustomModel()}
                placeholder="or type provider/model (e.g. deepseek/deepseek-r1)"
                className={`flex-1 px-3 py-2 text-sm bg-background border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 ${useCustomModel ? 'border-primary ring-1 ring-primary/25' : 'border-border'}`}
              />
              <button
                onClick={applyCustomModel}
                disabled={!customModel.trim() || !customModel.includes('/')}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-background border border-border text-muted hover:text-text hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Use
              </button>
            </div>
            {useCustomModel && (
              <p className="text-xs text-primary mt-1.5">Using custom model: <span className="font-mono">{values.llmModel}</span></p>
            )}
          </section>

          {/* ── API Key ────────────────────────────────────── */}
          <section>
            <SectionHeader
              title="API Key"
              subtitle="Your provider key — billed to your account, never leaves your machine"
            />
            <div className="mt-3 relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={showApiKey ? values.llmApiKey : maskApiKey(values.llmApiKey)}
                onChange={e => updateField('llmApiKey', e.target.value)}
                onFocus={() => setShowApiKey(true)}
                placeholder="sk-..."
                className="w-full px-3 py-2.5 pr-10 text-sm bg-background border border-border rounded-lg text-text placeholder:text-muted/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 font-mono"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-text transition-colors"
                title={showApiKey ? 'Hide' : 'Reveal'}
              >
                {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {selectedPreset && (
              <p className="text-xs mt-2.5">
                <span className="text-muted">Need a key? </span>
                <a
                  href={selectedPreset.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Get your {selectedPreset.provider} API key <ArrowIcon />
                </a>
              </p>
            )}

            <p className="text-[11px] text-muted/50 mt-1.5">
              Encrypted via OS keychain. All calls run from your machine — CSlate never sees your key.
            </p>
          </section>

          {/* ── Theme ──────────────────────────────────────── */}
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

          {/* ── Community Server ───────────────────────────── */}
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

function GatewayCard({ gateway, selected, onSelect }: { gateway: GatewayOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
        selected
          ? 'border-primary bg-primary/8 ring-1 ring-primary/25'
          : 'border-border hover:border-primary/30 hover:bg-background/50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{gateway.label}</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-background border border-border text-muted">
            {gateway.tagline}
          </span>
        </div>
        <p className="text-xs text-muted mt-0.5 truncate">{gateway.description}</p>
      </div>
      {selected && <CheckIcon />}
    </button>
  )
}

function TierBadge({ tier }: { tier: 'premium' | 'balanced' | 'budget' }) {
  const styles = {
    premium: 'bg-primary/10 text-primary border-primary/10',
    balanced: 'bg-success/10 text-success border-success/10',
    budget: 'bg-warning/10 text-warning border-warning/10',
  }
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${styles[tier]}`}>
      {tier}
    </span>
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

function LinkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="inline-block">
      <path d="M3 7l4-4M4 3h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline-block">
      <path d="M4 8l4-4M5 4h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
