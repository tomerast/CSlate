import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'

const MAX_HISTORY_MESSAGES = 6

export function useChat() {
  const { addMessage, setStatus, setCurrentCode, setPublishState, incrementTurnCount } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // Capture history BEFORE adding user message to avoid double-sending
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPublishState('hidden')

    // Buffer streaming tokens into a single assistant message
    let streamedContent = ''
    let streamMessageAdded = false

    const offToken = window.electron.on('agent:token', (data: unknown) => {
      const d = data as { delta: string }
      streamedContent += d.delta
      if (!streamMessageAdded) {
        addMessage({ role: 'assistant', content: streamedContent })
        streamMessageAdded = true
      } else {
        // Update the last message in-place
        useChatStore.setState(s => {
          const messages = [...s.messages]
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: streamedContent }
          }
          return { messages }
        })
      }
    })

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
    let didError = false
    const offError = window.electron.on('agent:error', (data: unknown) => {
      const d = data as { message: string; code?: string }
      didError = true
      if (d.code === 'UNCONFIGURED_LLM') {
        useAppStore.getState().openConfig('models')
        setStatus('idle')
        addMessage({
          role: 'assistant',
          content: "No AI provider configured — I've opened Settings so you can set one up."
        })
      } else {
        setStatus('error')
        addMessage({ role: 'assistant', content: `Error: ${d.message}` })
      }
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir: '',
        tabId: crypto.randomUUID(),
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })
      if (!didError) {
        setStatus('idle')
        incrementTurnCount()
      }
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offToolCall()
      offToolResult()
      offError()
    }
  }, [addMessage, setStatus, setCurrentCode, setPublishState, incrementTurnCount])

  return { submit }
}
