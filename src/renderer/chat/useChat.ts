import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'

const MAX_HISTORY_MESSAGES = 6

export function useChat() {
  const { addMessage, setStatus, setCurrentCode, setPanelOpen } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // Capture history BEFORE adding user message to avoid double-sending
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPanelOpen(true)

    try {
      const result = await window.electron.invoke('agent:run', {
        message: text,
        projectDir: '',
        tabId: crypto.randomUUID(),
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })

      // agent:run returns { ok: true } — actual responses come via agent:token/agent:done events
      // For now, mark as idle after the stream completes
      setStatus('idle')

      // TODO: listen to agent:token events for streaming updates
      if (result && typeof result === 'object' && 'message' in result) {
        addMessage({ role: 'assistant', content: (result as { message: string }).message })
      }
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
