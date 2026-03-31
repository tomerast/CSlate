import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  currentCode: string | null
  panelOpen: boolean
  turnCount: number
  publishState: 'hidden' | 'prompting' | 'publishing' | 'published' | 'declined'
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setCurrentCode(code: string | null): void
  setPanelOpen(v: boolean): void
  incrementTurnCount(): void
  setPublishState(s: ChatState['publishState']): void
  reset(): void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  status: 'idle',
  currentCode: null,
  panelOpen: false,
  turnCount: 0,
  publishState: 'hidden',
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setCurrentCode: (code) => set({ currentCode: code }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  incrementTurnCount: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  setPublishState: (s) => set({ publishState: s }),
  reset: () => set({
    messages: [],
    status: 'idle',
    currentCode: null,
    panelOpen: false,
    turnCount: 0,
    publishState: 'hidden',
  }),
}))
