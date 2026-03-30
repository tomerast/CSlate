import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import type { AgentRequest, AgentResponse } from '@shared/agentTypes'

export function useChat() {
  const { addMessage, setStatus, setCurrentCode, setPanelOpen } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // Capture history BEFORE adding user message to avoid double-sending
    const history = useChatStore.getState().messages.slice(-6)
    const currentCode = useChatStore.getState().currentCode ?? undefined

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPanelOpen(true)

    const request: AgentRequest = {
      message: text,
      history,
      currentCode,
      sessionId: `session-${Date.now()}`
    }

    try {
      const response = await window.electron.invoke('agent:generate', request) as AgentResponse
      if (response.componentCode) setCurrentCode(response.componentCode)
      setStatus('idle')
      addMessage({ role: 'assistant', content: response.message })
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    }
  }, [addMessage, setStatus, setCurrentCode, setPanelOpen])

  return { submit }
}
