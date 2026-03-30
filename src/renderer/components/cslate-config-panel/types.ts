export type Theme = 'dark' | 'light' | 'midnight'

export type GatewayMode = 'openrouter' | 'vercel' | 'cloudflare' | 'portkey' | 'helicone' | 'direct'

export type ConfigTab = 'theme' | 'models' | 'settings'

export type ConnectionMode = 'gateway' | 'direct'

export type DirectProvider = 'anthropic' | 'openai' | 'google' | 'local'

export interface ConfigValues {
  llmModel: string
  llmApiKey: string
  gatewayUrl: string
  gatewayMode: GatewayMode
  theme: Theme
  serverUrl: string
}

export interface ConfigPanelProps {
  llmModel?: string
  llmApiKey?: string
  gatewayUrl?: string
  gatewayMode?: GatewayMode
  theme?: Theme
  serverUrl?: string
  isOpen?: boolean
  focusTab?: ConfigTab
  onOutput?: (key: keyof ConfigValues, value: string) => void
  onEvent?: (event: string, payload: unknown) => void
}

export interface ModelPreset {
  id: string           // OpenRouter/gateway format: provider/model
  directModelId: string // Native provider model ID for direct API calls
  label: string
  provider: string
  description: string
  tier: 'premium' | 'balanced' | 'budget'
  keyUrl: string
  directProvider: DirectProvider | 'gateway-only'
  /** Which gateways support this model. 'all' = all 5 gateways; array = subset */
  supportedGateways: 'all' | GatewayMode[]
}

// Model IDs use OpenRouter format (provider/model with dashes).
// Vercel supports: Anthropic, OpenAI, Google only.
// Cloudflare compat adds: DeepSeek, Llama, Mistral.
// OpenRouter / Portkey / Helicone: all models.
export const MODEL_PRESETS: ModelPreset[] = [
  // ── Anthropic ──────────────────────────────────────────────
  {
    id: 'anthropic/claude-sonnet-4-6',
    directModelId: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description: 'Best balance of quality and speed',
    tier: 'premium',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    directProvider: 'anthropic',
    supportedGateways: 'all',
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    directModelId: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Fast and affordable',
    tier: 'balanced',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    directProvider: 'anthropic',
    supportedGateways: 'all',
  },
  // ── OpenAI ─────────────────────────────────────────────────
  {
    id: 'openai/gpt-4o',
    directModelId: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    description: 'Strong general-purpose model',
    tier: 'premium',
    keyUrl: 'https://platform.openai.com/api-keys',
    directProvider: 'openai',
    supportedGateways: 'all',
  },
  {
    id: 'openai/gpt-4o-mini',
    directModelId: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Compact and cost-effective',
    tier: 'balanced',
    keyUrl: 'https://platform.openai.com/api-keys',
    directProvider: 'openai',
    supportedGateways: 'all',
  },
  // ── Google ─────────────────────────────────────────────────
  {
    id: 'google/gemini-2.5-pro',
    directModelId: 'gemini-2.5-pro-preview',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'Advanced reasoning and long context',
    tier: 'premium',
    keyUrl: 'https://aistudio.google.com/apikey',
    directProvider: 'google',
    supportedGateways: 'all',
  },
  {
    id: 'google/gemini-2.5-flash',
    directModelId: 'gemini-2.5-flash-preview',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    description: 'Fast and cost-effective from Google',
    tier: 'balanced',
    keyUrl: 'https://aistudio.google.com/apikey',
    directProvider: 'google',
    supportedGateways: 'all',
  },
  // ── DeepSeek (gateway-only) ────────────────────────────────
  {
    id: 'deepseek/deepseek-r1',
    directModelId: 'deepseek-r1',
    label: 'DeepSeek R1',
    provider: 'DeepSeek',
    description: 'Open reasoning model, strong at math & code',
    tier: 'premium',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    directProvider: 'gateway-only',
    supportedGateways: 'all', // Vercel, OpenRouter, Cloudflare, Portkey, Helicone all use deepseek/deepseek-r1
  },
  {
    id: 'deepseek/deepseek-chat',
    directModelId: 'deepseek-chat',
    label: 'DeepSeek V3',
    provider: 'DeepSeek',
    description: 'Extremely cost-effective, great for general use',
    tier: 'budget',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    directProvider: 'gateway-only',
    supportedGateways: ['openrouter', 'cloudflare', 'portkey', 'helicone'], // Vercel uses deepseek-v3.x IDs
  },
  // ── Meta Llama (gateway-only) ──────────────────────────────
  // Note: Vercel uses `meta/` prefix; OpenRouter/Cloudflare use `meta-llama/`
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    directModelId: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'Open-source, strong instruction following',
    tier: 'balanced',
    keyUrl: 'https://openrouter.ai/keys',
    directProvider: 'gateway-only',
    supportedGateways: ['openrouter', 'cloudflare', 'portkey', 'helicone'], // Vercel uses meta/ prefix
  },
  // ── Mistral (gateway-only) ─────────────────────────────────
  // Note: Vercel uses `mistral/` prefix; OpenRouter uses `mistralai/`
  {
    id: 'mistralai/mistral-large',
    directModelId: 'mistral-large-latest',
    label: 'Mistral Large',
    provider: 'Mistral',
    description: 'European frontier model, multilingual',
    tier: 'balanced',
    keyUrl: 'https://console.mistral.ai/api-keys/',
    directProvider: 'gateway-only',
    supportedGateways: ['openrouter', 'cloudflare', 'portkey', 'helicone'], // Vercel uses mistral/ prefix
  },
  // ── Kimi & MiniMax — supported on Vercel, OpenRouter, Portkey ─
  {
    id: 'moonshotai/kimi-k2.5',
    directModelId: 'moonshot-v1-128k',
    label: 'Kimi K2.5',
    provider: 'Moonshot AI',
    description: 'Fast and affordable with solid results',
    tier: 'budget',
    keyUrl: 'https://platform.moonshot.cn/',
    directProvider: 'gateway-only',
    supportedGateways: 'all', // Verified: Vercel supports moonshotai/kimi-k2.5
  },
  {
    id: 'minimax/minimax-m2.5',
    directModelId: 'minimax-m2.5',
    label: 'MiniMax M2.5',
    provider: 'MiniMax',
    description: 'Extremely cheap, good for experimentation',
    tier: 'budget',
    keyUrl: 'https://www.minimax.chat',
    directProvider: 'gateway-only',
    supportedGateways: 'all', // Verified: Vercel supports minimax/minimax-m2.5
  },
]

export interface GatewayOption {
  id: GatewayMode
  label: string
  tagline: string
  description: string
  defaultUrl: string
  docsUrl: string
  signupUrl: string
  setupHint: string
}

export const GATEWAY_OPTIONS: GatewayOption[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    tagline: 'Easiest setup',
    description: '300+ models, BYOK or pay-through, OpenAI-compatible',
    defaultUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/docs',
    signupUrl: 'https://openrouter.ai/keys',
    setupHint: 'Sign up, get an API key, paste your gateway URL. Uses provider/model format natively.',
  },
  {
    id: 'vercel',
    label: 'Vercel AI Gateway',
    tagline: '180+ models',
    description: 'Anthropic, OpenAI, Google, DeepSeek, Kimi, MiniMax and 25+ providers',
    defaultUrl: 'https://ai-gateway.vercel.sh/v1',
    docsUrl: 'https://vercel.com/docs/ai-gateway',
    signupUrl: 'https://vercel.com/signup',
    setupHint: 'Sign up for Vercel, enable AI Gateway, and get an API key. Supports 180+ models across 30+ providers.',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare AI Gateway',
    tagline: 'Free with edge caching',
    description: 'Edge caching, rate limiting, analytics — free on all plans',
    defaultUrl: '',
    docsUrl: 'https://developers.cloudflare.com/ai-gateway/',
    signupUrl: 'https://dash.cloudflare.com',
    setupHint: 'Create a gateway in your Cloudflare dashboard, copy the gateway URL ending in /compat/chat/completions.',
  },
  {
    id: 'portkey',
    label: 'Portkey',
    tagline: 'Advanced routing',
    description: 'Load balancing, fallbacks, guardrails, 250+ models',
    defaultUrl: 'https://api.portkey.ai/v1',
    docsUrl: 'https://portkey.ai/docs',
    signupUrl: 'https://app.portkey.ai/signup',
    setupHint: 'Sign up, create a Virtual Key with your provider credentials, get your Portkey API key.',
  },
  {
    id: 'helicone',
    label: 'Helicone',
    tagline: 'Best observability',
    description: 'Logging, cost tracking, latency monitoring, 100+ models',
    defaultUrl: 'https://ai-gateway.helicone.ai',
    docsUrl: 'https://docs.helicone.ai',
    signupUrl: 'https://helicone.ai',
    setupHint: 'Sign up, get a Helicone API key, set base URL to ai-gateway.helicone.ai.',
  },
]

export const DIRECT_PROVIDER_OPTIONS: { id: DirectProvider; label: string; description: string; keyUrl: string }[] = [
  { id: 'anthropic', label: 'Anthropic', description: 'Claude models', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', label: 'OpenAI', description: 'GPT models', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google', label: 'Google', description: 'Gemini models', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'local', label: 'Local', description: 'Ollama (no key needed)', keyUrl: '' },
]

export const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Easy on the eyes' },
  { value: 'light', label: 'Light', description: 'Clean and bright' },
  { value: 'midnight', label: 'Midnight', description: 'Deep blue tones' },
]

export const DEFAULT_CONFIG: ConfigValues = {
  llmModel: 'anthropic/claude-sonnet-4-6',
  llmApiKey: '',
  gatewayUrl: 'https://openrouter.ai/api/v1',
  gatewayMode: 'openrouter',
  theme: 'dark',
  serverUrl: 'https://api.cslate.app',
}
