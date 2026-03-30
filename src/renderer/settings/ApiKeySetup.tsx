import React, { useState } from 'react'

interface Props {
  onComplete(): void
}

export function ApiKeySetup({ onComplete }: Props) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const trimmed = key.trim()
    if (!trimmed) {
      setError('API key is required')
      return
    }
    setError('')
    setSaving(true)
    try {
      await window.electron.invoke('config:set', { key: 'llmApiKey', value: trimmed })
      onComplete()
    } catch {
      setError('Failed to save key. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-8 w-full max-w-md shadow-lg border border-border">
        <h1 className="text-2xl font-bold text-text mb-2">Welcome to CSlate</h1>
        <p className="text-muted text-sm mb-6">
          Enter your LLM API key to start building with AI.
          This will be used with the Vercel AI Gateway.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Your API key..."
          className="w-full bg-background text-text border border-border rounded-md px-4 py-3 mb-2 outline-none focus:border-primary"
          autoFocus
        />
        {error && <p className="text-error text-sm mb-3">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving || !key.trim()}
          className="w-full bg-primary text-white font-semibold rounded-md px-4 py-3 mt-1 disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saving ? 'Saving...' : 'Get Started'}
        </button>
        <p className="text-muted text-xs mt-4">
          Your key is encrypted with your OS keychain via Electron safeStorage.
        </p>
      </div>
    </div>
  )
}

export default ApiKeySetup
