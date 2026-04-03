import { create } from 'zustand'
import type { ConfigTab } from '../components/cslate-config-panel/types'

interface AppState {
  configOpen: boolean
  configFocusTab: ConfigTab | undefined
  historyOpen: boolean
  openConfig: (focusTab?: ConfigTab) => void
  closeConfig: () => void
  openHistory: () => void
  closeHistory: () => void
}

export const useAppStore = create<AppState>((set) => ({
  configOpen: false,
  configFocusTab: undefined,
  historyOpen: false,
  openConfig: (focusTab) => set({ configOpen: true, configFocusTab: focusTab }),
  closeConfig: () => set({ configOpen: false, configFocusTab: undefined }),
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
}))
