import type { IpcMain } from 'electron'
import { net, shell } from 'electron'

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'local' | 'gateway'

interface ProviderModel {
  id: string
  label: string
}

interface ProviderRequest {
  provider: ProviderId
  apiKey?: string
  baseUrl?: string
}

interface ProviderResult {
  ok: boolean
  models: ProviderModel[]
  message?: string
}

const SETUP_URLS: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/app/apikey',
  local: 'https://ollama.com/download',
  gateway: 'https://vercel.com/docs/ai-gateway',
}

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  local: 'http://localhost:11434',
  gateway: 'https://ai-gateway.vercel.sh/v1',
}

function labelFromId(id: string): string {
  const name = id.includes('/') ? id.split('/').slice(1).join('/') : id
  return name
    .replace(/^models\//, '')
    .replace(/[-_:]/g, ' ')
    .replace(/\b(\d+)\s+(\d+)\b/g, '$1.$2')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function normalizeBaseUrl(provider: ProviderId, baseUrl?: string): string {
  const fallback = DEFAULT_BASE_URLS[provider]
  return (baseUrl || fallback).replace(/\/$/, '')
}

function ollamaApiUrl(baseUrl?: string): string {
  return normalizeBaseUrl('local', baseUrl).replace(/\/v1$/, '')
}

async function fetchJson(url: string, init?: Parameters<typeof net.fetch>[1]): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await net.fetch(url, { ...init, signal: controller.signal })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(timeout)
  }
}

function openAiModels(data: unknown): ProviderModel[] {
  const rows = (data as { data?: Array<{ id?: string }> })?.data ?? []
  return rows
    .map(row => row.id)
    .filter((id): id is string => !!id && !/(embed|image|audio|tts|whisper|dall-e)/i.test(id))
    .map(id => ({ id, label: labelFromId(id) }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function claudeModels(data: unknown): ProviderModel[] {
  const rows = (data as { data?: Array<{ id?: string; display_name?: string }> })?.data ?? []
  return rows
    .map(row => row.id ? { id: row.id, label: row.display_name || labelFromId(row.id) } : null)
    .filter((row): row is ProviderModel => !!row)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function geminiModels(data: unknown): ProviderModel[] {
  const rows = (data as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> })?.models ?? []
  return rows
    .filter(row => row.supportedGenerationMethods?.includes('generateContent'))
    .map(row => row.name ? {
      id: row.name.replace(/^models\//, ''),
      label: row.displayName || labelFromId(row.name),
    } : null)
    .filter((row): row is ProviderModel => !!row)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function ollamaModels(data: unknown): ProviderModel[] {
  const rows = (data as { models?: Array<{ name?: string; model?: string }> })?.models ?? []
  return rows
    .map(row => row.name || row.model)
    .filter((id): id is string => !!id)
    .map(id => ({ id, label: labelFromId(id) }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function listModels({ provider, apiKey, baseUrl }: ProviderRequest): Promise<ProviderResult> {
  try {
    if (provider === 'anthropic') {
      if (!apiKey) return { ok: false, models: [], message: 'Paste a Claude API key first.' }
      const res = await fetchJson(`${normalizeBaseUrl(provider)}/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      })
      return res.ok
        ? { ok: true, models: claudeModels(res.data) }
        : { ok: false, models: [], message: `Claude returned HTTP ${res.status}.` }
    }

    if (provider === 'google') {
      if (!apiKey) return { ok: false, models: [], message: 'Paste a Gemini API key first.' }
      const url = `${normalizeBaseUrl(provider)}/models?key=${encodeURIComponent(apiKey)}`
      const res = await fetchJson(url)
      return res.ok
        ? { ok: true, models: geminiModels(res.data) }
        : { ok: false, models: [], message: `Gemini returned HTTP ${res.status}.` }
    }

    if (provider === 'local') {
      const res = await fetchJson(`${ollamaApiUrl(baseUrl)}/api/tags`)
      return res.ok
        ? { ok: true, models: ollamaModels(res.data) }
        : { ok: false, models: [], message: 'Ollama is not reachable on localhost.' }
    }

    const url = `${normalizeBaseUrl(provider, provider === 'gateway' ? baseUrl : undefined)}/models`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetchJson(url, { headers })
    return res.ok
      ? { ok: true, models: openAiModels(res.data) }
      : { ok: false, models: [], message: `${provider === 'gateway' ? 'Gateway' : 'OpenAI'} returned HTTP ${res.status}.` }
  } catch (err) {
    return { ok: false, models: [], message: err instanceof Error ? err.message : String(err) }
  }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('providers:open-setup', async (_event, provider: ProviderId) => {
    await shell.openExternal(SETUP_URLS[provider] ?? SETUP_URLS.gateway)
    return { ok: true }
  })

  ipcMain.handle('providers:list-models', async (_event, request: ProviderRequest) =>
    listModels(request))

  ipcMain.handle('providers:validate', async (_event, request: ProviderRequest) => {
    const result = await listModels(request)
    return {
      ok: result.ok,
      message: result.ok ? 'Connected' : result.message,
      models: result.models,
    }
  })

  ipcMain.handle('providers:detect-ollama', async (_event, baseUrl?: string) =>
    listModels({ provider: 'local', baseUrl }))
}
