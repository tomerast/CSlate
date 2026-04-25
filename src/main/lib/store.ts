import Store from 'electron-store'

export interface ConfigStore {
  llmProvider: 'anthropic' | 'openai' | 'google' | 'local' | 'gateway'
  llmModel: string
  llmFastModel: string
  llmBaseUrl?: string
  gatewayUrl: string
  serverUrl: string
  projectDir?: string
  theme: 'dark' | 'light' | 'midnight'
  recentProjects: unknown[]
  _secure_llmApiKey?: string
  _secure_serverApiKey?: string
  _secure_gatewayApiKey?: string
  serverEmail?: string
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
    llmFastModel: 'anthropic/claude-haiku-4-5',
    gatewayUrl: '',
    serverUrl: 'http://localhost:3000',
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
