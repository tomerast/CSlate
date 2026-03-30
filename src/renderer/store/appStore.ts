import { create } from 'zustand'
import type { ConfigTab } from '../components/cslate-config-panel/types'

interface AppState {
  configOpen: boolean
  configFocusTab: ConfigTab | undefined
  openConfig: (focusTab?: ConfigTab) => void
  closeConfig: () => void
}

export const useAppStore = create<AppState>((set) => ({
  configOpen: false,
  configFocusTab: undefined,
  openConfig: (focusTab) => set({ configOpen: true, configFocusTab: focusTab }),
  closeConfig: () => set({ configOpen: false, configFocusTab: undefined }),
}))
