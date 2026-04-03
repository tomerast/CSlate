import { useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { useAppStore } from '../store/appStore'
import { useCanvasStore, type Placement } from '../store/canvasStore'
import type { BuildingTask } from '../canvas/building/types'

const MAX_HISTORY_MESSAGES = 6
const DEFAULT_BUILDING_PLACEMENT = { x: 2, y: 2, width: 50 }

async function ensureSession(projectDir: string): Promise<string> {
  const { activeSessionId } = useChatStore.getState()
  if (activeSessionId) return activeSessionId
  try {
    const result = await window.electron.invoke('session:create', { projectDir }) as { sessionId: string }
    if (result.sessionId) {
      useChatStore.getState().setActiveSessionId(result.sessionId)
      return result.sessionId
    }
  } catch { /* session persistence unavailable */ }
  return ''
}

async function saveSession(projectDir: string, sessionId: string): Promise<void> {
  if (!sessionId) return
  const { messages, activeComponentIds } = useChatStore.getState()
  try {
    await window.electron.invoke('session:save', {
      projectDir,
      sessionId,
      componentIds: activeComponentIds,
      messages: messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
    })
  } catch { /* non-fatal */ }
}

export function useChat() {
  const { addMessage, setStatus, incrementTurnCount, setPublishState, setPublishPayload } = useChatStore()

  const submit = useCallback(async (text: string) => {
    if (useChatStore.getState().status === 'generating') {
      useChatStore.getState().enqueueMessage(text)
      return
    }

    const projectDir = ''
    const sessionId = await ensureSession(projectDir)

    const history = useChatStore.getState().messages.slice(-MAX_HISTORY_MESSAGES)

    addMessage({ role: 'user', content: text })
    setStatus('generating')
    setPublishState('hidden')

    const tabId = crypto.randomUUID()
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

      // If modifying an existing component, remove the building card — the fix
      // happens in-place on the existing canvas component, no overlay needed.
      const existing = useCanvasStore.getState().components.find(c => c.componentId === d.componentId)
      if (existing) {
        useCanvasStore.getState().removeBuildingCard(tabId)
      } else {
        useCanvasStore.getState().updateBuildingCard(tabId, {
          phase: 'plan',
          componentName: d.componentId.replace(/_/g, ' '),
          description: d.description,
          tasks,
        })
      }
    })

    const offBuildPartial = window.electron.on('agent:build:partial', (data: unknown) => {
      const d = data as { buildId: string; bundle?: string; source?: string }
      if (d.buildId !== tabId) return
      useCanvasStore.getState().updateBuildingCard(tabId, {
        partialBundle: d.bundle,
        partialSource: d.source,
      })
    })

    const offToolResult = window.electron.on('agent:tool-result', (data: unknown) => {
      const d = data as {
        tool: string
        result: {
          data?: Record<string, unknown>
          success?: boolean
          bundle?: string
          files?: Record<string, string>
          manifest?: unknown
          placement?: Placement
          componentId?: string
        }
      }

      if (d.tool === 'removeComponent') {
        const r = (d.result?.data ?? d.result) as { removed?: string[] }
        if (r?.removed) {
          for (const id of r.removed) {
            useCanvasStore.getState().removeComponent(id)
          }
          // Also remove from active session tracking
          const remaining = useChatStore.getState().activeComponentIds.filter(
            id => !r.removed!.includes(id)
          )
          useChatStore.getState().setActiveComponentIds(remaining)
        }
        return
      }

      if (d.tool === 'writeComponent') {
        // buildTool wraps results in { data: {...} } — unwrap for stream path (skills)
        // Orchestrator sends unwrapped results directly, so handle both shapes
        const r = (d.result?.data ?? d.result) as typeof d.result
        if (!r?.success) return
        const { componentId, bundle, placement, manifest } = r
        if (componentId && bundle && placement && manifest) {
          // Source files: prefer preview (orchestrator path), fall back to result (fix skill path)
          const preview = useCanvasStore.getState().preview
          const sourceFiles = preview?.files ?? (r as Record<string, unknown>).files as Record<string, string> | undefined ?? {}
          const m = (manifest ?? {}) as Record<string, unknown>
          setPublishPayload({
            name: (m.name as string) ?? 'Untitled Component',
            description: (m.description as string) ?? 'A CSlate component',
            tags: (m.tags as string[]) ?? [],
            source: sourceFiles,
            manifest,
          })
          useCanvasStore.getState().addComponent({ componentId, bundle, placement, manifest })
          useCanvasStore.getState().clearPreview()
          useCanvasStore.getState().removeBuildingCard(tabId)
          // Only trigger publish countdown if the agent marked this as worth sharing
          const shouldPublish = (r as Record<string, unknown>).republish !== false
          if (shouldPublish) {
            setPublishState('countdown')
          }
          // Link this component to the active session
          useChatStore.getState().addActiveComponentId(componentId)
        }
      }
    })

    const offOrchestratorStatus = window.electron.on('agent:orchestrator:status', (data: unknown) => {
      const d = data as { phase: string; workerId?: number; file?: string; workerCount?: number; status?: string }

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

    const offAction = window.electron.on('agent:action', (data: unknown) => {
      const d = data as { type: string; componentId?: string; componentIds?: string[] }
      if (d.type === 'remove-component' && d.componentId) {
        useCanvasStore.getState().removeComponent(d.componentId)
        const remaining = useChatStore.getState().activeComponentIds.filter(id => id !== d.componentId)
        useChatStore.getState().setActiveComponentIds(remaining)
      } else if (d.type === 'clear-canvas' && d.componentIds) {
        for (const id of d.componentIds) {
          useCanvasStore.getState().removeComponent(id)
        }
        useChatStore.getState().setActiveComponentIds([])
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
      useCanvasStore.getState().removeBuildingCard(tabId)
    })

    try {
      await window.electron.invoke('agent:run', {
        message: text,
        projectDir,
        tabId,
        conversationHistory: history.map(m => ({ role: m.role, content: m.content })),
        activeComponentIds: useChatStore.getState().activeComponentIds,
      })
      setStatus('idle')
      incrementTurnCount()
    } catch (e) {
      setStatus('error')
      // Clear queued messages on error — don't auto-fire them into a broken state
      useChatStore.setState({ messageQueue: [] })
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
      offAction()
      offError()
      useChatStore.setState({ statusLabel: '' })
      useCanvasStore.getState().removeBuildingCard(tabId)
      // Save session after each completed turn
      await saveSession(projectDir, sessionId)
      // Process next queued message only if the current run succeeded
      if (useChatStore.getState().status === 'idle') {
        const next = useChatStore.getState().shiftQueue()
        if (next) submit(next)
      }
    }
  }, [addMessage, setStatus, incrementTurnCount, setPublishState, setPublishPayload])

  return { submit }
}
