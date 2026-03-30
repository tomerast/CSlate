import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'

const MAX_HISTORY_MESSAGES = 6

export function useChat() {
  const { addMessage, setStatus, setCurrentCode, setPanelOpen, setPublishState } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // Capture history BEFORE adding user message to avoid double-sending
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPanelOpen(true)
    setPublishState('hidden')

    // Track code from renderComponent tool calls so we can trigger the publish toast
    let pendingCode: string | null = null
    const offToolCall = window.electron.on('agent:tool-call', (data: unknown) => {
      const d = data as { tool: string; input: { files?: { 'ui.tsx'?: string } } }
      if (d.tool === 'renderComponent' && d.input?.files?.['ui.tsx']) {
        pendingCode = d.input.files['ui.tsx']
      }
    })
    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as { tool: string; result: { success?: boolean } }
      if (d.tool === 'renderComponent' && d.result?.success && pendingCode) {
        setCurrentCode(pendingCode)
        setPublishState('prompting')
        pendingCode = null
      }
    })

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

      if (result && typeof result === 'object' && 'message' in result) {
        addMessage({ role: 'assistant', content: (result as { message: string }).message })
      }
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToolCall()
      offToolResult()
    }
  }, [addMessage, setStatus, setCurrentCode, setPanelOpen, setPublishState])

  return { submit }
}
