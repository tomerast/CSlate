import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { useCanvasStore, type Placement } from '../store/canvasStore'

const MAX_HISTORY_MESSAGES = 6

export function useChat() {
  const { addMessage, setStatus, setPanelOpen, setPublishState } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // Capture history BEFORE adding user message to avoid double-sending
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPanelOpen(true)
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

    // Route tool results to canvasStore
    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as {
        tool: string
        result: {
          success?: boolean
          bundle?: string
          files?: Record<string, string>
          manifest?: unknown
          placement?: Placement
          componentId?: string
        }
      }

      if (d.tool === 'renderComponent' && d.result?.success) {
        const { bundle, files, manifest, placement } = d.result
        if (bundle && files && manifest) {
          useCanvasStore.getState().setPreview({ bundle, files, manifest, placement })
          setPublishState('prompting')
        }
      } else if (d.tool === 'writeComponent' && d.result?.success) {
        const { componentId, bundle, placement, manifest } = d.result
        if (componentId && bundle && placement && manifest) {
          useCanvasStore.getState().addComponent({ componentId, bundle, placement, manifest })
          useCanvasStore.getState().clearPreview()
          setPublishState('prompting')
        }
      }
    })
    const offError = window.electron.on('agent:error', (data: unknown) => {
      const d = data as { message: string; code?: string }
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
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offToolResult()
      offError()
    }
  }, [addMessage, setStatus, setPanelOpen, setPublishState])

  return { submit }
}
