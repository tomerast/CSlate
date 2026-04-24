import { useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatStore'
import { sessionsApi } from './sessions-api'
import type { AgentMessage, MessageCard } from '@shared/agentTypes'

/**
 * Wires the renderer's chatStore to the agent IPC stream.
 *
 * Responsibilities:
 *  - ensure a session exists before sending
 *  - persist user + assistant messages on completion
 *  - forward agent:token / agent:card / agent:done / agent:error events
 */
export function useChat(modelId: string) {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const setActiveSession = useChatStore((s) => s.setActiveSession)
  const appendMessage = useChatStore((s) => s.appendMessage)
  const beginAssistantStream = useChatStore((s) => s.beginAssistantStream)
  const appendStreamDelta = useChatStore((s) => s.appendStreamDelta)
  const attachCardToStream = useChatStore((s) => s.attachCardToStream)
  const endStream = useChatStore((s) => s.endStream)
  const setError = useChatStore((s) => s.setError)
  const setSessions = useChatStore((s) => s.setSessions)
  const setOrchestratorPhase = useChatStore((s) => s.setOrchestratorPhase)
  const setWorkerTotal = useChatStore((s) => s.setWorkerTotal)
  const setWorkerDone = useChatStore((s) => s.setWorkerDone)
  const addToolCall = useChatStore((s) => s.addToolCall)
  const updateToolCall = useChatStore((s) => s.updateToolCall)
  const clearOrchestrator = useChatStore((s) => s.clearOrchestrator)

  const resetOrchestrator = useCallback(() => {
    clearOrchestrator()
  }, [clearOrchestrator])

  const tabIdRef = useRef<string>(crypto.randomUUID())

  // Attach lifetime IPC listeners once per hook instance
  useEffect(() => {
    const offToken = window.electron.on('agent:token', (payload: unknown) => {
      const { delta } = payload as { delta: string }
      appendStreamDelta(delta)
    })
    const offCard = window.electron.on('agent:card', (payload: unknown) => {
      const { card } = payload as { card: MessageCard }
      attachCardToStream(card)
    })
    const offDone = window.electron.on('agent:done', () => {
      void finalizeStream()
    })
    const offError = window.electron.on('agent:error', (payload: unknown) => {
      const { message } = payload as { message: string }
      setError(message)
      endStream()
    })
    const offStatus = window.electron.on('agent:orchestrator:status', (payload: unknown) => {
      const p = payload as { phase: string; workerCount?: number; workerId?: number; file?: string; status?: string }
      if (p.phase) {
        setOrchestratorPhase(p.phase as import('../store/chatStore').OrchestratorPhase)
      }
      if (p.workerCount !== undefined) {
        setWorkerTotal(p.workerCount)
      }
      if (p.status === 'done') {
        const state = useChatStore.getState()
        setWorkerDone(Math.min(state.orchestrator.workerDone + 1, state.orchestrator.workerTotal || 1))
      }
    })
    const offToolCall = window.electron.on('agent:tool-call', (payload: unknown) => {
      const p = payload as { tool: string; args?: Record<string, unknown> }
      addToolCall({
        name: p.tool,
        status: 'running',
        timestamp: Date.now(),
        detail: p.args ? Object.keys(p.args).slice(0, 3).join(', ') : undefined,
      })
    })
    const offToolResult = window.electron.on('agent:tool-result', (payload: unknown) => {
      const p = payload as { tool: string; result?: { success?: boolean; error?: string } }
      updateToolCall(
        p.tool,
        p.result?.success === false ? 'error' : 'done',
        p.result?.error ?? (p.result?.success ? 'completed' : undefined)
      )
    })

    return () => {
      offToken()
      offCard()
      offDone()
      offError()
      offStatus()
      offToolCall()
      offToolResult()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finalizeStream = useCallback(async () => {
    const { activeSessionId: sid, messages, streamingMessageId } = useChatStore.getState()
    endStream()
    resetOrchestrator()
    if (!sid || !streamingMessageId) return
    const assistantMsg = messages.find((m) => m.id === streamingMessageId)
    if (assistantMsg) {
      await sessionsApi.append(sid, assistantMsg)
    }
    // Refresh sidebar so updatedAt + messageCount are current
    const list = await sessionsApi.list()
    setSessions(list)
  }, [endStream, setSessions, resetOrchestrator])

  const submit = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim()
      if (!trimmed) return

      let sessionId = activeSessionId
      let history: AgentMessage[] = useChatStore.getState().messages
      let isFirstMessage = false

      if (!sessionId) {
        const session = await sessionsApi.create(modelId)
        sessionId = session.id
        history = []
        isFirstMessage = true
        setActiveSession(session.id, [])
      }

      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        cards: [],
        createdAt: Date.now(),
      }
      appendMessage(userMessage)
      await sessionsApi.append(sessionId, userMessage)

      // Fire-and-forget auto-title on the first exchange
      if (isFirstMessage) {
        void sessionsApi
          .autoTitle(sessionId, trimmed)
          .then(() => sessionsApi.list())
          .then((list) => setSessions(list))
          .catch(() => {})
      }

      beginAssistantStream(crypto.randomUUID())

      const conversationHistory = [...history, userMessage].map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      }))

      try {
        await window.electron.invoke('agent:run', {
          message: trimmed,
          projectDir: '',
          tabId: tabIdRef.current,
          conversationHistory,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        endStream()
      }
    },
    [
      activeSessionId,
      modelId,
      appendMessage,
      beginAssistantStream,
      setActiveSession,
      setError,
      endStream,
      setSessions,
    ],
  )

  /** Cancel any in-flight agent stream for this tab. */
  const abortInFlight = useCallback(async () => {
    try {
      await window.electron.invoke('agent:abort', undefined)
    } catch {
      // Nothing to cancel or main process already reset — ignore
    }
    endStream()
  }, [endStream])

  const startNewSession = useCallback(() => {
    void abortInFlight()
    setActiveSession(null, [])
  }, [abortInFlight, setActiveSession])

  const loadSession = useCallback(
    async (id: string) => {
      // Avoid re-loading the session that's already active
      if (useChatStore.getState().activeSessionId === id) return
      await abortInFlight()
      const session = await sessionsApi.get(id)
      if (session) setActiveSession(session.id, session.messages)
    },
    [abortInFlight, setActiveSession],
  )

  const refreshSessions = useCallback(async () => {
    const list = await sessionsApi.list()
    setSessions(list)
  }, [setSessions])

  const regenerateLast = useCallback(async (): Promise<void> => {
    const state = useChatStore.getState()
    const sid = state.activeSessionId
    if (!sid) return

    // Walk backwards to find the last user turn and drop everything after it
    const messages = [...state.messages]
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx < 0) return

    const preserved = messages.slice(0, lastUserIdx + 1)
    const lastUserMessage = preserved[preserved.length - 1]
    setActiveSession(sid, preserved)

    // Persist truncation on disk so session:append stays coherent
    await sessionsApi.replace(sid, preserved)

    beginAssistantStream(crypto.randomUUID())
    const conversationHistory = preserved.map((m) => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    }))
    try {
      await window.electron.invoke('agent:run', {
        message: lastUserMessage.content,
        projectDir: '',
        tabId: tabIdRef.current,
        conversationHistory,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      endStream()
    }
  }, [beginAssistantStream, setActiveSession, setError, endStream])

  const forkFromMessage = useCallback(
    async (messageId: string): Promise<void> => {
      const sid = useChatStore.getState().activeSessionId
      if (!sid) return
      const forked = await sessionsApi.fork(sid, messageId)
      if (!forked) return
      setActiveSession(forked.id, forked.messages)
      const list = await sessionsApi.list()
      setSessions(list)
    },
    [setActiveSession, setSessions],
  )

  return {
    submit,
    startNewSession,
    loadSession,
    refreshSessions,
    regenerateLast,
    forkFromMessage,
  }
}
