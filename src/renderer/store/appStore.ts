import { create } from 'zustand'

interface AppState {
  apiKeySet: boolean
  setApiKeySet(v: boolean): void
}

export const useAppStore = create<AppState>((set) => ({
  apiKeySet: false,
  setApiKeySet: (v) => set({ apiKeySet: v })
}))
