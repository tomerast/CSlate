import { useCallback, useRef } from 'react'
import { useChatStore } from '../store/chatStore'
import type { AgentRequest, AgentResponse } from '@shared/agentTypes'

export function useChat() {
  const { messages, addMessage, setStatus, setCurrentCode, setPanelOpen } = useChatStore()
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const submit = useCallback(async (text: string) => {
    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPanelOpen(true)

    const currentCode = useChatStore.getState().currentCode ?? undefined
    const request: AgentRequest = {
      message: text,
      history: messagesRef.current.slice(-6),
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
