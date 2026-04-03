export type Theme = 'dark' | 'light' | 'midnight'

export type ConfigTab = 'theme' | 'models' | 'settings'

export interface ConfigValues {
  llmModel: string
  llmApiKey: string
  gatewayUrl: string
  theme: Theme
  serverUrl: string
}

export interface ConfigPanelProps {
  llmModel?: string
  llmApiKey?: string
  gatewayUrl?: string
  theme?: Theme
  serverUrl?: string
  serverEmail?: string
  isOpen?: boolean
  focusTab?: ConfigTab
  onOutput?: (key: keyof ConfigValues, value: string) => void
  onEvent?: (event: string, payload: unknown) => void
}

export interface ProviderPreset {
  id: string
  label: string
  url: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { id: 'vercel',     label: 'Vercel',     url: 'https://ai-gateway.vercel.sh/v1' },
  { id: 'anthropic',  label: 'Anthropic',  url: 'https://api.anthropic.com/v1' },
  { id: 'openai',     label: 'OpenAI',     url: 'https://api.openai.com/v1' },
  { id: 'google',     label: 'Google',     url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'ollama',     label: 'Ollama',     url: 'http://localhost:11434/v1' },
]

export const MODEL_SUGGESTIONS: { id: string; label: string; note?: string }[] = [
  { id: 'anthropic/claude-sonnet-4-6',             label: 'Claude Sonnet 4.6',          note: 'recommended' },
  { id: 'anthropic/claude-opus-4-6',               label: 'Claude Opus 4.6' },
  { id: 'anthropic/claude-haiku-4-5',              label: 'Claude Haiku 4.5',           note: 'fast' },
  { id: 'openai/gpt-4o',                           label: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini',                      label: 'GPT-4o Mini',                note: 'fast' },
  { id: 'google/gemini-3.1-pro-preview',           label: 'Gemini 3.1 Pro' },
  { id: 'google/gemini-3-flash',                   label: 'Gemini 3 Flash',             note: 'fast' },
  { id: 'google/gemini-2.5-pro',                   label: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-r1',                    label: 'DeepSeek R1',                note: 'reasoning' },
  { id: 'deepseek/deepseek-chat',                  label: 'DeepSeek V3' },
  { id: 'moonshotai/kimi-k2.5',                    label: 'Kimi K2.5' },
  { id: 'moonshotai/kimi-k2.5-thinking',           label: 'Kimi K2.5 Thinking',         note: 'reasoning' },
  { id: 'minimax/minimax-m2.7',                    label: 'MiniMax M2.7' },
  { id: 'minimax/minimax-m2.5',                    label: 'MiniMax M2.5' },
  { id: 'qwen/qwen3.5-397b-a17b',                  label: 'Qwen 3.5 397B' },
  { id: 'meta-llama/llama-3.3-70b-instruct',       label: 'Llama 3.3 70B' },
  { id: 'mistralai/mistral-large',                 label: 'Mistral Large' },
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
  theme: 'dark',
  serverUrl: 'https://api.cslate.app',
}
