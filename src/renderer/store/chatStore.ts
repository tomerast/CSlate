import { create } from 'zustand'
import type { AgentMessage, MessageCard, SessionSummary } from '@shared/agentTypes'

type Status = 'idle' | 'generating' | 'error'

interface ChatState {
  activeSessionId: string | null
  messages: AgentMessage[]
  sessions: SessionSummary[]
  streamingMessageId: string | null
  status: Status
  error: string | null

  setSessions(sessions: SessionSummary[]): void
  setActiveSession(sessionId: string | null, messages: AgentMessage[]): void
  appendMessage(message: AgentMessage): void
  beginAssistantStream(messageId: string): void
  appendStreamDelta(delta: string): void
  attachCardToStream(card: MessageCard): void
  endStream(): void
  setStatus(status: Status): void
  setError(error: string | null): void
  clear(): void
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeSessionId: null,
  messages: [],
  sessions: [],
  streamingMessageId: null,
  status: 'idle',
  error: null,

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (sessionId, messages) =>
    set({ activeSessionId: sessionId, messages, streamingMessageId: null, status: 'idle', error: null }),

  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  beginAssistantStream: (messageId) => {
    const draft: AgentMessage = {
      id: messageId,
      role: 'assistant',
      content: '',
      cards: [],
      createdAt: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, draft],
      streamingMessageId: messageId,
      status: 'generating',
    }))
  },

  appendStreamDelta: (delta) => {
    const { streamingMessageId } = get()
    if (!streamingMessageId) return
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === streamingMessageId ? { ...m, content: m.content + delta } : m,
      ),
    }))
  },

  attachCardToStream: (card) => {
    const { streamingMessageId } = get()
    if (!streamingMessageId) return
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === streamingMessageId ? { ...m, cards: [...m.cards, card] } : m,
      ),
    }))
  },

  endStream: () => set({ streamingMessageId: null, status: 'idle' }),

  setStatus: (status) => set({ status }),

  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

  clear: () =>
    set({
      activeSessionId: null,
      messages: [],
      streamingMessageId: null,
      status: 'idle',
      error: null,
    }),
}))
