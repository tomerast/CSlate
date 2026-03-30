export type Theme = 'dark' | 'light' | 'midnight'

export type GatewayMode = 'openrouter' | 'vercel' | 'cloudflare' | 'portkey' | 'helicone' | 'direct'

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
  onOutput?: (key: keyof ConfigValues, value: string) => void
  onEvent?: (event: string, payload: unknown) => void
}

export interface ModelPreset {
  id: string
  label: string
  provider: string
  description: string
  tier: 'premium' | 'balanced' | 'budget'
  keyUrl: string
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    description: 'Best balance of quality and speed',
    tier: 'premium',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    description: 'Fast and affordable',
    tier: 'balanced',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    description: 'Strong general-purpose model',
    tier: 'premium',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Compact and cost-effective',
    tier: 'balanced',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    description: 'Advanced reasoning and long context',
    tier: 'premium',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'minimax/minimax-m2.5',
    label: 'MiniMax M2.5',
    provider: 'MiniMax',
    description: 'Extremely cheap, good for experimentation',
    tier: 'budget',
    keyUrl: 'https://www.minimax.chat',
  },
  {
    id: 'moonshotai/kimi-k2.5',
    label: 'Kimi K2.5',
    provider: 'Moonshot AI',
    description: 'Fast and affordable with solid results',
    tier: 'budget',
    keyUrl: 'https://kimi.moonshot.cn',
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
    tagline: 'Zero-config',
    description: 'Automatic caching, observability, and provider fallbacks',
    defaultUrl: 'https://ai-gateway.vercel.sh',
    docsUrl: 'https://vercel.com/docs/ai-gateway',
    signupUrl: 'https://vercel.com/signup',
    setupHint: 'Works out of the box if you deploy on Vercel. Otherwise, set up via the Vercel dashboard.',
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
  {
    id: 'direct',
    label: 'Direct',
    tagline: 'No middleman',
    description: 'Call provider APIs directly with your own key',
    defaultUrl: '',
    docsUrl: '',
    signupUrl: '',
    setupHint: 'Your API key goes straight to the provider. No caching or logging.',
  },
]

export const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: 'dark', label: 'Dark', description: 'Easy on the eyes' },
  { value: 'light', label: 'Light', description: 'Clean and bright' },
  { value: 'midnight', label: 'Midnight', description: 'Deep blue tones' },
]

export const DEFAULT_CONFIG: ConfigValues = {
  llmModel: 'anthropic/claude-sonnet-4.6',
  llmApiKey: '',
  gatewayUrl: 'https://openrouter.ai/api/v1',
  gatewayMode: 'openrouter',
  theme: 'dark',
  serverUrl: 'https://api.cslate.app',
}
