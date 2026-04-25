import { create } from 'zustand'
import type { ConfigTab, Theme } from '../components/cslate-config-panel/types'

export interface UserPreferences {
  theme: Theme
  density: 'comfortable' | 'compact'
  extras: Record<string, unknown>
}

interface AppState {
  configOpen: boolean
  configFocusTab: ConfigTab | undefined
  memoryOpen: boolean
  sidebarCollapsed: boolean
  preferences: UserPreferences
  openConfig: (focusTab?: ConfigTab) => void
  closeConfig: () => void
  openMemory: () => void
  closeMemory: () => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setPreferences: (patch: Partial<UserPreferences>) => void
}

export const useAppStore = create<AppState>((set) => ({
  configOpen: false,
  configFocusTab: undefined,
  memoryOpen: false,
  sidebarCollapsed: false,
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
  setPreferences: (patch) =>
    set((s) => ({ preferences: { ...s.preferences, ...patch } })),
}))
