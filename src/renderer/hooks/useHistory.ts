import { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'
import { useAppStore } from '../store/appStore'

export interface HistoryComponent {
  componentId: string
  manifest: {
    name: string
    description: string
    tags: string[]
  }
  lastEditedAt: number
  onCanvas: boolean
  sessionIds: string[]
}

export function useHistory() {
  const [components, setComponents] = useState<HistoryComponent[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electron.invoke('component:list-all', { projectDir: '' }) as {
        components: HistoryComponent[]
      }
      setComponents(result.components ?? [])
    } catch {
      setComponents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const resumeComponent = useCallback(async (componentId: string) => {
    const projectDir = ''

    // Add to canvas if not already there
    const onCanvas = useCanvasStore.getState().components.some(c => c.componentId === componentId)
    if (!onCanvas) {
      try {
        const result = await window.electron.invoke('canvas:add-component', { projectDir, componentId }) as {
          success: boolean
          componentId: string
          bundle: string
          placement: { x: number; y: number; width: number; height: number }
          manifest: unknown
        }
        if (result.success) {
          useCanvasStore.getState().addComponent({
            componentId: result.componentId,
            bundle: result.bundle,
            placement: result.placement,
            manifest: result.manifest,
          })
        }
      } catch { /* continue even if canvas add fails */ }
    }

    // Load latest session
    try {
      const { sessionIds } = await window.electron.invoke('session:list-for-component', {
        projectDir,
        componentId,
      }) as { sessionIds: string[] }

      if (sessionIds.length > 0) {
        const latestSessionId = sessionIds[sessionIds.length - 1]
        const { messages } = await window.electron.invoke('session:load', {
          projectDir,
          sessionId: latestSessionId,
        }) as { messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> }

        useChatStore.setState({
          messages,
          activeSessionId: latestSessionId,
          activeComponentIds: [componentId],
        })
      } else {
        useChatStore.setState({
          messages: [],
          activeSessionId: null,
          activeComponentIds: [componentId],
        })
      }
    } catch { /* non-fatal */ }

    // Open chat panel and close history panel
    useChatStore.getState().setPanelOpen(true)
    useAppStore.getState().closeHistory()
  }, [])

  return { components, loading, refresh, resumeComponent }
}
