import { create } from 'zustand'
import type { ConfigTab, Theme } from '../components/cslate-config-panel/types'

export type LayoutMode = 'hero' | 'conversation'
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'local'

export interface UserPreferences {
  theme: Theme
  density: 'comfortable' | 'compact'
  extras: Record<string, unknown>
}

const PROVIDER_META: Record<ProviderId, { name: string; color: string }> = {
  anthropic: { name: 'Claude', color: '#D4A574' },
  openai: { name: 'GPT', color: '#7CCF8F' },
  google: { name: 'Gemini', color: '#7BB4F0' },
  local: { name: 'Local', color: '#B8A0E0' },
}

export function getProviderMeta(id: ProviderId) {
  return PROVIDER_META[id]
}

interface AppState {
  configOpen: boolean
  configFocusTab: ConfigTab | undefined
  memoryOpen: boolean
  sidebarCollapsed: boolean
  activeProvider: ProviderId
  preferences: UserPreferences
  openConfig: (focusTab?: ConfigTab) => void
  closeConfig: () => void
  openMemory: () => void
  closeMemory: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveProvider: (provider: ProviderId) => void
  setPreferences: (patch: Partial<UserPreferences>) => void
}

export const useAppStore = create<AppState>((set) => ({
  configOpen: false,
  configFocusTab: undefined,
  memoryOpen: false,
  sidebarCollapsed: false,
  activeProvider: 'anthropic',
  preferences: {
    theme: 'dark',
    density: 'comfortable',
    extras: {},
  },
  openConfig: (focusTab) => set({ configOpen: true, configFocusTab: focusTab }),
  closeConfig: () => set({ configOpen: false, configFocusTab: undefined }),
  openMemory: () => set({ memoryOpen: true }),
  closeMemory: () => set({ memoryOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setActiveProvider: (activeProvider) => set({ activeProvider }),
  setPreferences: (patch) =>
    set((s) => ({ preferences: { ...s.preferences, ...patch } })),
}))
