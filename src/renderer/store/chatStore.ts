import { create } from 'zustand'
import type { AgentMessage, MessageCard, SessionSummary } from '@shared/agentTypes'

type Status = 'idle' | 'generating' | 'error'

export type OrchestratorPhase =
  | 'understand'
  | 'search'
  | 'plan'
  | 'dispatch'
  | 'worker'
  | 'validate'
  | 'ship'
  | 'fix'

export interface ToolCallEntry {
  name: string
  status: 'running' | 'done' | 'error'
  timestamp: number
  detail?: string
}

export interface OrchestratorStatus {
  currentPhase: OrchestratorPhase | null
  phaseHistory: OrchestratorPhase[]
  toolCalls: ToolCallEntry[]
  workerTotal: number
  workerDone: number
}

interface ChatState {
  activeSessionId: string | null
  messages: AgentMessage[]
  sessions: SessionSummary[]
  streamingMessageId: string | null
  status: Status
  error: string | null
  orchestrator: OrchestratorStatus

  setSessions(sessions: SessionSummary[]): void
  setActiveSession(sessionId: string | null, messages: AgentMessage[]): void
  appendMessage(message: AgentMessage): void
  beginAssistantStream(messageId: string): void
  appendStreamDelta(delta: string): void
  attachCardToStream(card: MessageCard): void
  endStream(): void
  setStatus(status: Status): void
  setError(error: string | null): void
  setOrchestratorPhase(phase: OrchestratorPhase): void
  setWorkerTotal(total: number): void
  setWorkerDone(done: number): void
  addToolCall(call: ToolCallEntry): void
  updateToolCall(name: string, status: ToolCallEntry['status'], detail?: string): void
  clearOrchestrator(): void
  clear(): void
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeSessionId: null,
  messages: [],
  sessions: [],
  streamingMessageId: null,
  status: 'idle',
  error: null,
  orchestrator: {
    currentPhase: null,
    phaseHistory: [],
    toolCalls: [],
    workerTotal: 0,
    workerDone: 0,
  },

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (sessionId, messages) =>
    set({ activeSessionId: sessionId, messages, streamingMessageId: null, status: 'idle', error: null, orchestrator: { currentPhase: null, phaseHistory: [], toolCalls: [], workerTotal: 0, workerDone: 0 } }),

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
      orchestrator: { currentPhase: null, phaseHistory: [], toolCalls: [], workerTotal: 0, workerDone: 0 },
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

  setOrchestratorPhase: (phase) =>
    set((state) => ({
      orchestrator: {
        ...state.orchestrator,
        currentPhase: phase,
        phaseHistory: state.orchestrator.phaseHistory.includes(phase)
          ? state.orchestrator.phaseHistory
          : [...state.orchestrator.phaseHistory, phase],
      },
    })),

  setWorkerTotal: (total) =>
    set((state) => ({
      orchestrator: { ...state.orchestrator, workerTotal: total },
    })),

  setWorkerDone: (done) =>
    set((state) => ({
      orchestrator: { ...state.orchestrator, workerDone: done },
    })),

  addToolCall: (call) =>
    set((state) => ({
      orchestrator: {
        ...state.orchestrator,
        toolCalls: [...state.orchestrator.toolCalls, call],
      },
    })),

  updateToolCall: (name, status, detail) =>
    set((state) => {
      let idx = -1
      for (let i = state.orchestrator.toolCalls.length - 1; i >= 0; i -= 1) {
        const c = state.orchestrator.toolCalls[i]
        if (c.name === name && c.status === 'running') {
          idx = i
          break
        }
      }
      if (idx < 0) return state
      const updated = [...state.orchestrator.toolCalls]
      updated[idx] = { ...updated[idx], status, detail: detail ?? updated[idx].detail }
      return { orchestrator: { ...state.orchestrator, toolCalls: updated } }
    }),

  clearOrchestrator: () =>
    set({
      orchestrator: { currentPhase: null, phaseHistory: [], toolCalls: [], workerTotal: 0, workerDone: 0 },
    }),

  clear: () =>
    set({
      activeSessionId: null,
      messages: [],
      sessions: [],
      streamingMessageId: null,
      status: 'idle',
      error: null,
      orchestrator: { currentPhase: null, phaseHistory: [], toolCalls: [], workerTotal: 0, workerDone: 0 },
    }),
}))
