import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { compilePipeline } from './compiler'
import { DataBus } from './data-bus'
import type {
  PipelineManifest,
  PipelineOutput,
  PipelineStatus,
  PipelineState,
  WorkerCommand,
  WorkerResponse,
} from './types'

const SHIM_PATH = join(__dirname, 'worker-shim.js')

interface SecretProvider {
  getSecret(name: string): Promise<string>
}

interface ManagedPipeline {
  pipelineId: string
  manifest: PipelineManifest
  worker: Worker | null
  state: PipelineState
  lastOutput: PipelineOutput | null
  lastError: string | null
  startedAt: number | null
  pollTimer: ReturnType<typeof setInterval> | null
  cache: { output: PipelineOutput; expiresAt: number } | null
}

export class PipelineExecutor {
  private pipelines = new Map<string, ManagedPipeline>()
  private projectDir: string
  private bus: DataBus
  private secrets: SecretProvider

  constructor(projectDir: string, bus: DataBus, secrets: SecretProvider) {
    this.projectDir = projectDir
    this.bus = bus
    this.secrets = secrets
  }

  async startPipeline(pipelineId: string, params?: Record<string, unknown>): Promise<void> {
    const pipelineDir = join(this.projectDir, 'pipelines', pipelineId)
    const manifestPath = join(pipelineDir, 'manifest.json')

    let manifestRaw: string
    try {
      manifestRaw = await readFile(manifestPath, 'utf-8')
    } catch {
      throw new Error(`Pipeline "${pipelineId}" not found at ${pipelineDir}`)
    }

    const manifest: PipelineManifest = JSON.parse(manifestRaw)

    // Compile pipeline
    const bundlePath = await compilePipeline(pipelineDir)

    // Resolve secrets
    const resolvedSecrets: Record<string, string> = {}
    for (const [name, def] of Object.entries(manifest.secrets)) {
      try {
        resolvedSecrets[name] = await this.secrets.getSecret(name)
      } catch {
        if (def.required) throw new Error(`Required secret "${name}" not configured`)
      }
    }

    // Spawn worker
    const worker = new Worker(SHIM_PATH, {
      workerData: { bundlePath, secrets: resolvedSecrets },
    })

    const managed: ManagedPipeline = {
      pipelineId,
      manifest,
      worker,
      state: 'idle',
      lastOutput: null,
      lastError: null,
      startedAt: Date.now(),
      pollTimer: null,
      cache: null,
    }

    // Wait for ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker startup timeout')), 10000)

      worker.once('message', (msg: WorkerResponse) => {
        clearTimeout(timeout)
        if (msg.type === 'ready') {
          managed.state = 'running'
          resolve()
        } else if (msg.type === 'error') {
          managed.state = 'error'
          managed.lastError = msg.error
          reject(new Error(msg.error))
        }
      })

      worker.once('error', (err) => {
        clearTimeout(timeout)
        managed.state = 'error'
        managed.lastError = err.message
        reject(err)
      })
    })

    this.pipelines.set(pipelineId, managed)

    // Start polling if configured
    if (manifest.strategy.type === 'polling' && manifest.strategy.intervalMs) {
      managed.state = 'polling'
      managed.pollTimer = setInterval(async () => {
        try {
          await this.execute(pipelineId, params ?? {})
        } catch {
          // Error already captured in managed.lastError
        }
      }, manifest.strategy.intervalMs)
    }

    // Start streaming if configured
    if (manifest.strategy.type === 'streaming') {
      managed.state = 'streaming'
      worker.on('message', (msg: WorkerResponse) => {
        if (msg.type === 'data') {
          managed.lastOutput = msg.output
          this.bus.publish(pipelineId, msg.output)
        } else if (msg.type === 'error') {
          managed.lastError = msg.error
          managed.state = 'error'
        }
      })
      worker.postMessage({ type: 'stream', params: params ?? {} } satisfies WorkerCommand)
    }
  }

  async execute(pipelineId: string, params: Record<string, unknown>): Promise<PipelineOutput> {
    const managed = this.pipelines.get(pipelineId)
    if (!managed || !managed.worker) {
      throw new Error(`Pipeline "${pipelineId}" is not running`)
    }

    // Check cache
    const cacheTtl = managed.manifest.strategy.cacheTtlMs
    if (cacheTtl && managed.cache && Date.now() < managed.cache.expiresAt) {
      const cached: PipelineOutput = {
        ...managed.cache.output,
        metadata: { ...managed.cache.output.metadata, cached: true },
      }
      return cached
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        managed.state = 'error'
        managed.lastError = 'Execution timeout (30s)'
        reject(new Error('Execution timeout (30s)'))
      }, 30000)

      managed.worker!.once('message', (msg: WorkerResponse) => {
        clearTimeout(timeout)
        if (msg.type === 'data') {
          managed.lastOutput = msg.output
          managed.lastError = null

          // Cache result
          if (cacheTtl) {
            managed.cache = {
              output: msg.output,
              expiresAt: Date.now() + cacheTtl,
            }
          }

          this.bus.publish(pipelineId, msg.output)
          resolve(msg.output)
        } else if (msg.type === 'error') {
          managed.state = 'error'
          managed.lastError = msg.error
          reject(new Error(msg.error))
        }
      })

      managed.worker!.postMessage({ type: 'execute', params } satisfies WorkerCommand)
    })
  }

  async stopPipeline(pipelineId: string): Promise<void> {
    const managed = this.pipelines.get(pipelineId)
    if (!managed) return

    if (managed.pollTimer) {
      clearInterval(managed.pollTimer)
      managed.pollTimer = null
    }

    if (managed.worker) {
      try {
        managed.worker.postMessage({ type: 'dispose' } satisfies WorkerCommand)
        await Promise.race([
          new Promise<void>((resolve) => {
            managed.worker!.once('message', (msg: WorkerResponse) => {
              if (msg.type === 'disposed') resolve()
            })
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ])
      } catch {
        // Worker may already be dead
      }
      await managed.worker.terminate()
      managed.worker = null
    }

    managed.state = 'stopped'
    managed.cache = null
  }

  async restartPipeline(pipelineId: string, params?: Record<string, unknown>): Promise<void> {
    await this.stopPipeline(pipelineId)
    await this.startPipeline(pipelineId, params)
  }

  getStatus(pipelineId: string): PipelineStatus | null {
    const managed = this.pipelines.get(pipelineId)
    if (!managed) return null

    return {
      pipelineId,
      state: managed.state,
      lastOutput: managed.lastOutput ?? undefined,
      lastError: managed.lastError ?? undefined,
      uptimeMs: managed.startedAt ? Date.now() - managed.startedAt : undefined,
    }
  }

  getAllStatuses(): Map<string, PipelineStatus> {
    const result = new Map<string, PipelineStatus>()
    for (const [id] of this.pipelines) {
      const status = this.getStatus(id)
      if (status) result.set(id, status)
    }
    return result
  }

  async stopAll(): Promise<void> {
    const ids = [...this.pipelines.keys()]
    await Promise.all(ids.map((id) => this.stopPipeline(id)))
  }
}
