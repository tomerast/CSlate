import type { IpcMain } from 'electron'

// These interfaces match the pipeline runtime from Plans 1 & 2.
// Once the runtime is implemented, these can be replaced with direct imports.

interface PipelineRuntimeStatus {
  state: string
  lastError?: string
  uptimeMs?: number
}

interface PipelineExecutor {
  getAllStatuses(): Map<string, PipelineRuntimeStatus>
  getStatus(pipelineId: string): PipelineRuntimeStatus | null
  execute(pipelineId: string, params: Record<string, unknown>): Promise<unknown>
  startPipeline(pipelineId: string): Promise<void>
  stopPipeline(pipelineId: string): Promise<void>
}

interface DataBus {
  getLatest(pipelineId: string): unknown
  subscribe(pipelineId: string, callback: (data: unknown) => void): () => void
}

interface PipelinesJson {
  pipelines: Array<{
    pipelineId: string
    status: 'active' | 'inactive' | 'error'
    lastRun?: number
    error?: string
    connectedComponents: string[]
  }>
}

async function readPipelinesJson(projectDir: string): Promise<PipelinesJson> {
  const { readFile } = await import('fs/promises')
  const { join } = await import('path')
  try {
    const content = await readFile(join(projectDir, 'pipelines.json'), 'utf-8')
    return JSON.parse(content) as PipelinesJson
  } catch {
    return { pipelines: [] }
  }
}

export function register(
  ipcMain: IpcMain,
  executor: PipelineExecutor,
  bus: DataBus,
  projectDir: string,
): void {
  ipcMain.handle('pipeline:list', async () => {
    const registry = await readPipelinesJson(projectDir)
    const statuses = executor.getAllStatuses()
    return registry.pipelines.map((entry) => ({
      ...entry,
      runtimeStatus: statuses.get(entry.pipelineId) ?? null,
    }))
  })

  ipcMain.handle('pipeline:get-data', async (_event, { pipelineId }: { pipelineId: string }) => {
    const cached = bus.getLatest(pipelineId)
    if (cached) return cached

    try {
      const output = await executor.execute(pipelineId, {})
      return output
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('pipeline:start', async (_event, { pipelineId }: { pipelineId: string }) => {
    await executor.startPipeline(pipelineId)
    return { success: true }
  })

  ipcMain.handle('pipeline:stop', async (_event, { pipelineId }: { pipelineId: string }) => {
    await executor.stopPipeline(pipelineId)
    return { success: true }
  })

  ipcMain.handle('pipeline:status', async (_event, { pipelineId }: { pipelineId: string }) => {
    return executor.getStatus(pipelineId)
  })

  // Subscription management — tracks which renderers are subscribed to which pipelines
  const subscriptions = new Map<string, Map<string, () => void>>()

  ipcMain.on('pipeline:subscribe', (event, { pipelineId }: { pipelineId: string }) => {
    const sender = event.sender
    const senderId = String(sender.id)

    if (!subscriptions.has(senderId)) {
      subscriptions.set(senderId, new Map())
    }

    // Avoid duplicate subscriptions
    if (subscriptions.get(senderId)!.has(pipelineId)) return

    const unsub = bus.subscribe(pipelineId, (data) => {
      if (!sender.isDestroyed()) {
        sender.send('pipeline:data', { pipelineId, data })
      }
    })

    subscriptions.get(senderId)!.set(pipelineId, unsub)

    // Send latest data immediately if available
    const latest = bus.getLatest(pipelineId)
    if (latest && !sender.isDestroyed()) {
      sender.send('pipeline:data', { pipelineId, data: latest })
    }
  })

  ipcMain.on('pipeline:unsubscribe', (event, { pipelineId }: { pipelineId: string }) => {
    const senderId = String(event.sender.id)
    const senderSubs = subscriptions.get(senderId)
    if (senderSubs) {
      const unsub = senderSubs.get(pipelineId)
      if (unsub) {
        unsub()
        senderSubs.delete(pipelineId)
      }
    }
  })
}
