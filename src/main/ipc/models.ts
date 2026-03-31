import type { IpcMain } from 'electron'
import { net } from 'electron'

interface FetchedModel {
  id: string
  label: string
  description: string
  context?: number
}

// In-memory cache: gatewayUrl → { models, fetchedAt }
const modelCache = new Map<string, { models: FetchedModel[]; fetchedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Model IDs that are NOT chat/text models — exclude these
const EXCLUDE_PATTERNS = [
  /embed/i, /dalle/i, /tts/i, /whisper/i, /image-gen/i,
  /video/i, /vision-only/i, /audio/i, /transcri/i,
  /\bflux\b/i, /\bveo\b/i, /\bkling\b/i, /\bseed(ance|dance)\b/i,
  /\bimagine\b/i, /\bsuno\b/i, /\bstable-diffusion\b/i,
]

function isChatModel(id: string): boolean {
  return !EXCLUDE_PATTERNS.some(p => p.test(id))
}

function parseModelLabel(id: string): string {
  // 'anthropic/claude-sonnet-4-6' → 'Claude Sonnet 4.6'
  const name = id.includes('/') ? id.split('/').slice(1).join('/') : id
  return name
    .replace(/-/g, ' ')
    .replace(/\b(\d+)[\s-](\d+)\b/g, '$1.$2') // 4 6 → 4.6
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('models:fetch', async (_event, {
    gatewayUrl,
    apiKey,
  }: { gatewayUrl: string; apiKey?: string }) => {
    if (!gatewayUrl) return { models: [], error: 'No gateway URL' }

    const cached = modelCache.get(gatewayUrl)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { models: cached.models }
    }

    try {
      const modelsUrl = gatewayUrl.replace(/\/$/, '') + '/models'
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      const res = await net.fetch(modelsUrl, { headers })
      if (!res.ok) return { models: [], error: `HTTP ${res.status}` }

      const data = await res.json() as { data?: Array<{ id: string; description?: string; context_length?: number }> }
      const raw = data?.data ?? []

      const models: FetchedModel[] = raw
        .filter(m => isChatModel(m.id))
        .map(m => ({
          id: m.id,
          label: parseModelLabel(m.id),
          description: m.description?.slice(0, 80) ?? '',
          context: m.context_length,
        }))
        .sort((a, b) => a.id.localeCompare(b.id))

      modelCache.set(gatewayUrl, { models, fetchedAt: Date.now() })
      return { models }
    } catch (err) {
      return { models: [], error: err instanceof Error ? err.message : String(err) }
    }
  })
}
