import { create } from 'zustand'
import type { AgentMessage } from '@shared/agentTypes'

export type NewMessage = Pick<AgentMessage, 'role' | 'content'>

interface ChatState {
  messages: AgentMessage[]
  status: 'idle' | 'generating' | 'error'
  panelOpen: boolean
  turnCount: number
  publishState: 'hidden' | 'countdown' | 'publishing' | 'published'
  statusLabel: string
  messageQueue: string[]
  addMessage(msg: NewMessage): void
  setStatus(s: ChatState['status']): void
  setPanelOpen(v: boolean): void
  incrementTurnCount(): void
  setPublishState(s: ChatState['publishState']): void
  enqueueMessage(msg: string): void
  shiftQueue(): string | undefined
  reset(): void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  panelOpen: false,
  turnCount: 0,
  publishState: 'hidden',
  statusLabel: '',
  messageQueue: [],
  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, { ...msg, timestamp: Date.now() }] })),
  setStatus: (status) => set({ status }),
  setPanelOpen: (v) => set({ panelOpen: v }),
  incrementTurnCount: () => set((s) => ({ turnCount: s.turnCount + 1 })),
  setPublishState: (publishState) => set({ publishState }),
  enqueueMessage: (msg) => set((s) => ({ messageQueue: [...s.messageQueue, msg] })),
  shiftQueue: () => {
    const { messageQueue } = get()
    if (messageQueue.length === 0) return undefined
    set({ messageQueue: messageQueue.slice(1) })
    return messageQueue[0]
  },
  reset: () => set({
    messages: [],
    status: 'idle',
    panelOpen: false,
    turnCount: 0,
    publishState: 'hidden',
    statusLabel: '',
    messageQueue: [],
  }),
}))
