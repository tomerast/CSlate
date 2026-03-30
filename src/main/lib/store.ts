import Store from 'electron-store'

export interface ConfigStore {
  llmProvider: 'anthropic' | 'openai' | 'google' | 'local'
  llmModel: string
  llmBaseUrl?: string
  gatewayUrl: string
  serverUrl: string
  theme: 'dark' | 'light' | 'midnight'
  recentProjects: unknown[]
  _secure_llmApiKey?: string
  _secure_serverApiKey?: string
  _secure_gatewayApiKey?: string
}

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

export const configStore = new Store<ConfigStore>({
  name: 'config',
  defaults: {
    llmProvider: 'anthropic',
    llmModel: 'anthropic/claude-sonnet-4-6',
    gatewayUrl: 'https://openrouter.ai/api/v1',
    serverUrl: 'https://api.cslate.app',
    theme: 'dark',
    recentProjects: [],
  }
})

export const windowStore = new Store<WindowState>({
  name: 'window-state',
  defaults: {
    width: 1280,
    height: 800,
    isMaximized: false,
  }
})
