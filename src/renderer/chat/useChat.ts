import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { useCanvasStore, type Placement } from '../store/canvasStore'
import type { BuildingTask } from '../canvas/building/types'

const MAX_HISTORY_MESSAGES = 6

// Default placement for the BuildingCard before the plan arrives
const DEFAULT_BUILDING_PLACEMENT = { x: 2, y: 2, width: 50 }

export function useChat() {
  const { addMessage, setStatus, incrementTurnCount, setPublishState } = useChatStore()

  const submit = useCallback(async (text: string) => {
    // If already building, queue and return
    if (useChatStore.getState().status === 'generating') {
      useChatStore.getState().enqueueMessage(text)
      return
    }

    // Capture history BEFORE adding user message
    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPublishState('hidden')

    // Generate tabId here so we can reference it in event handlers below
    const tabId = crypto.randomUUID()

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

    // Building card: start
    const offBuildStart = window.electron.on('agent:build:start', (data: unknown) => {
      const d = data as { buildId: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().addBuildingCard({
        buildId: tabId,
        phase: 'think',
        tasks: [],
        placement: DEFAULT_BUILDING_PLACEMENT,
      })
    })

    // Building card: plan arrived
    const offBuildPlan = window.electron.on('agent:build:plan', (data: unknown) => {
      const d = data as {
        buildId: string
        componentId: string
        description: string
        tasks: Array<{ file: string; assignment: string }>
      }
      if (d.buildId !== tabId) return
      const tasks: BuildingTask[] = d.tasks.map(t => ({
        file: t.file,
        assignment: t.assignment,
        status: 'pending' as const,
      }))
      useCanvasStore.getState().updateBuildingCard(tabId, {
        phase: 'plan',
        componentName: d.componentId.replace(/_/g, ' '),
        description: d.description,
        tasks,
      })
    })

    // Building card: partial render ready
    const offBuildPartial = window.electron.on('agent:build:partial', (data: unknown) => {
      const d = data as { buildId: string; bundle?: string; source?: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().updateBuildingCard(tabId, {
        partialBundle: d.bundle,
        partialSource: d.source,
      })
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
          useCanvasStore.getState().removeBuildingCard(tabId)
          setPublishState('prompting')
        }
      }
    })

    // Orchestrator phase → update building card phase, task statuses, and statusLabel
    const offOrchestratorStatus = window.electron.on('agent:orchestrator:status', (data: unknown) => {
      const d = data as { phase: string; workerId?: number; file?: string; workerCount?: number; status?: string }

      // Keep statusLabel updated for ChatPanel
      const phaseLabels: Record<string, string> = {
        understand: 'Understanding your request...',
        search: 'Searching for blueprints...',
        plan: 'Planning component...',
        dispatch: `Building ${d.workerCount ?? ''} files in parallel...`,
        worker: d.file ? `Building ${d.file}...` : 'Building...',
        validate: 'Validating component...',
        fix: 'Fixing issues...',
        ship: 'Component ready!',
      }
      useChatStore.setState({ statusLabel: phaseLabels[d.phase] ?? d.phase })

      // Map fine-grained phases to BuildPhase for the BuildingCard
      const phaseMap: Record<string, 'think' | 'plan' | 'build' | 'test' | 'done'> = {
        understand: 'think',
        search: 'think',
        plan: 'plan',
        dispatch: 'build',
        worker: 'build',
        validate: 'test',
        fix: 'test',
        ship: 'done',
      }
      const buildPhase = phaseMap[d.phase]
      if (buildPhase) {
        useCanvasStore.getState().updateBuildingCard(tabId, { phase: buildPhase })
      }

      // Update individual task row status
      if (d.phase === 'worker' && d.file) {
        const { buildingCards } = useCanvasStore.getState()
        const card = buildingCards.find(c => c.buildId === tabId)
        if (card) {
          const updatedTasks: BuildingTask[] = card.tasks.map(t =>
            t.file === d.file
              ? { ...t, status: (d.status === 'done' ? 'done' : 'building') as BuildingTask['status'] }
              : t
          )
          useCanvasStore.getState().updateBuildingCard(tabId, { tasks: updatedTasks })
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
      // Clean up any stray building card on error
      useCanvasStore.getState().removeBuildingCard(tabId)
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir: '',
        tabId,
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
      })
      setStatus('idle')
      incrementTurnCount()
    } catch (e) {
      setStatus('error')
      addMessage({
        role: 'assistant',
        content: `Failed: ${e instanceof Error ? e.message : String(e)}`
      })
    } finally {
      offToken()
      offBuildStart()
      offBuildPlan()
      offBuildPartial()
      offToolResult()
      offOrchestratorStatus()
      offError()
      useChatStore.setState({ statusLabel: '' })
      // Clean up building card if it wasn't removed by writeComponent
      useCanvasStore.getState().removeBuildingCard(tabId)
      // Drain queue
      const next = useChatStore.getState().shiftQueue()
      if (next) setTimeout(() => submit(next), 0)
    }
  }, [addMessage, setStatus, incrementTurnCount, setPublishState])

  return { submit }
}
