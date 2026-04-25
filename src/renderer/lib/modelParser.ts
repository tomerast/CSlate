/**
 * Parse a model ID string into displayable metadata.
 * Supports formats:
 *   anthropic/claude-sonnet-4-6         - native
 *   openai:moonshotai/kimi-k2.6        - OpenRouter gateway with provider override
 *   openai/gpt-4o                       - OpenRouter simple
 */

export interface ParsedModel {
  fullId: string
  /** e.g. "anthropic", "openai", "google", "moonshotai" */
  provider: string
  /** e.g. "claude-sonnet-4-6", "kimi-k2.6" */
  model: string
  /** Human display label, e.g. "Claude Sonnet 4.6", "Kimi K2.6" */
  displayName: string
  /** Accent color hex for this provider */
  color: string
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#D4A574',
  openai: '#7CCF8F',
  google: '#7BB4F0',
  deepseek: '#F87171',
  moonshotai: '#A78BFA',
  minimax: '#FBBF24',
  qwen: '#F472B6',
  'meta-llama': '#818CF8',
  mistralai: '#6EE7B7',
  ollama: '#B8A0E0',
  default: '#8A8AA0',
}

const KNOWN_MODEL_LABELS: Record<string, string> = {
  'anthropic/claude-sonnet-4-6': 'Claude Sonnet',
  'anthropic/claude-opus-4-6': 'Claude Opus',
  'anthropic/claude-haiku-4-5': 'Claude Haiku',
  'openai/gpt-4o': 'GPT-4o',
  'openai/gpt-4o-mini': 'GPT-4o Mini',
  'openai/gpt-4': 'GPT-4',
  'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'google/gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'google/gemini-3-flash': 'Gemini 3 Flash',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'deepseek/deepseek-r1': 'DeepSeek R1',
  'deepseek/deepseek-chat': 'DeepSeek V3',
  'moonshotai/kimi-k2.5': 'Kimi K2.5',
  'moonshotai/kimi-k2.5-thinking': 'Kimi K2.5 Thinking',
  'moonshotai/kimi-k2.6': 'Kimi K2.6',
  'minimax/minimax-m2.7': 'MiniMax M2.7',
  'minimax/minimax-m2.5': 'MiniMax M2.5',
  'qwen/qwen3.5-397b-a17b': 'Qwen 3.5',
  'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B',
  'mistralai/mistral-large': 'Mistral Large',
}

function cleanModelName(model: string): string {
  return model
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function cleanProviderName(provider: string): string {
  const map: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    deepseek: 'DeepSeek',
    moonshotai: 'Moonshot',
    minimax: 'MiniMax',
    qwen: 'Qwen',
    'meta-llama': 'Meta',
    mistralai: 'Mistral',
    ollama: 'Ollama',
  }
  return map[provider] || provider.charAt(0).toUpperCase() + provider.slice(1)
}

export function parseModelId(modelId: string | undefined): ParsedModel {
  if (!modelId) {
    return {
      fullId: '',
      provider: 'default',
      model: 'Unknown',
      displayName: 'Unknown Model',
      color: PROVIDER_COLORS.default,
    }
  }

  const id = modelId.trim()
  if (!id) {
    return {
      fullId: '',
      provider: 'default',
      model: 'Unknown',
      displayName: 'Unknown Model',
      color: PROVIDER_COLORS.default,
    }
  }

  // Strip gateway prefix like "openai:"
  let raw = id
  let gateway: string | null = null
  if (id.includes(':')) {
    const [g, rest] = id.split(':', 2)
    gateway = g
    raw = rest || id
  }

  // Split provider / model
  const slashIdx = raw.indexOf('/')
  let provider = slashIdx >= 0 ? raw.slice(0, slashIdx) : (gateway || 'default')
  const model = slashIdx >= 0 ? raw.slice(slashIdx + 1) : raw

  // Normalize provider aliases
  if (provider === 'openai' && raw.startsWith('moonshotai/')) {
    provider = 'moonshotai' // OpenRouter gateway masquerade
  }

  // Build full key for label lookup
  const lookupKey = `${provider}/${model}`
  const displayName = KNOWN_MODEL_LABELS[lookupKey] || `${cleanProviderName(provider)} ${cleanModelName(model)}`

  return {
    fullId: id,
    provider,
    model,
    displayName,
    color: PROVIDER_COLORS[provider] || PROVIDER_COLORS.default,
  }
}
