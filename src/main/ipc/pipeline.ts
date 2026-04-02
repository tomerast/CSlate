import type { IpcMain } from 'electron'
import { PipelineExecutor } from '../pipeline/executor'
import { DataBus } from '../pipeline/data-bus'
import { readPipelinesJson } from '../pipeline/pipelines-json'
import { getConfigValue } from './config'

// Lazy-initialized singletons — created on first IPC call that needs them
let executor: PipelineExecutor | null = null
let bus: DataBus | null = null

function getProjectDir(): string {
  return getConfigValue('projectDir') as string ?? ''
}

function ensureRuntime(): { executor: PipelineExecutor; bus: DataBus } {
  if (!bus) {
    bus = new DataBus()
  }
  if (!executor) {
    const projectDir = getProjectDir()
    const secrets = {
      getSecret: async (name: string) => (getConfigValue(name) as string) ?? '',
    }
    executor = new PipelineExecutor(projectDir, bus, secrets)
  }
  return { executor, bus }
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('pipeline:list', async () => {
    const { executor: ex } = ensureRuntime()
    const projectDir = getProjectDir()
    const registry = await readPipelinesJson(projectDir)
    const statuses = ex.getAllStatuses()
    return registry.pipelines.map((entry) => ({
      ...entry,
      runtimeStatus: statuses.get(entry.pipelineId) ?? null,
    }))
  })

  ipcMain.handle('pipeline:get-data', async (_event, { pipelineId }: { pipelineId: string }) => {
    const { executor: ex, bus: b } = ensureRuntime()
    const cached = b.getLatest(pipelineId)
    if (cached) return cached

    try {
      const output = await ex.execute(pipelineId, {})
      return output
    } catch (err) {
      return { error: (err as Error).message }
    }
  })

  ipcMain.handle('pipeline:start', async (_event, { pipelineId }: { pipelineId: string }) => {
    const { executor: ex } = ensureRuntime()
    await ex.startPipeline(pipelineId)
    return { success: true }
  })

  ipcMain.handle('pipeline:stop', async (_event, { pipelineId }: { pipelineId: string }) => {
    const { executor: ex } = ensureRuntime()
    await ex.stopPipeline(pipelineId)
    return { success: true }
  })

  ipcMain.handle('pipeline:status', async (_event, { pipelineId }: { pipelineId: string }) => {
    const { executor: ex } = ensureRuntime()
    return ex.getStatus(pipelineId)
  })

  // Subscription management — tracks which renderers are subscribed to which pipelines
  const subscriptions = new Map<string, Map<string, () => void>>()

  ipcMain.on('pipeline:subscribe', (event, { pipelineId }: { pipelineId: string }) => {
    const { bus: b } = ensureRuntime()
    const sender = event.sender
    const senderId = String(sender.id)

    if (!subscriptions.has(senderId)) {
      subscriptions.set(senderId, new Map())
    }

    // Avoid duplicate subscriptions
    if (subscriptions.get(senderId)!.has(pipelineId)) return

    const unsub = b.subscribe(pipelineId, (data) => {
      if (!sender.isDestroyed()) {
        sender.send('pipeline:data', { pipelineId, data })
      }
    })

    subscriptions.get(senderId)!.set(pipelineId, unsub)

    // Send latest data immediately if available
    const latest = b.getLatest(pipelineId)
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
