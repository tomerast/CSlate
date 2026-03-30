import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  currentCode: string | null
  panelOpen: boolean
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setCurrentCode(code: string | null): void
  setPanelOpen(v: boolean): void
  reset(): void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  status: 'idle',
  currentCode: null,
  panelOpen: false,
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setCurrentCode: (code) => set({ currentCode: code }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  reset: () => set({ messages: [], status: 'idle', currentCode: null, panelOpen: false })
}))
