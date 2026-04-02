import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Worker } from 'node:worker_threads'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compilePipeline } from '../compiler'
import type { WorkerCommand, WorkerResponse } from '../types'

const SHIM_PATH = join(__dirname, '..', 'worker-shim.js')

function sendAndWait(worker: Worker, cmd: WorkerCommand): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000)
    worker.once('message', (msg: WorkerResponse) => {
      clearTimeout(timeout)
      resolve(msg)
    })
    worker.postMessage(cmd)
  })
}

function waitForMessage(worker: Worker): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000)
    worker.once('message', (msg: WorkerResponse) => {
      clearTimeout(timeout)
      resolve(msg)
    })
  })
}

describe('worker-shim', () => {
  let pipelineDir: string
  let worker: Worker | null = null

  beforeEach(async () => {
    pipelineDir = await mkdtemp(join(tmpdir(), 'worker-test-'))
  })

  afterEach(async () => {
    if (worker) {
      await worker.terminate()
      worker = null
    }
    await rm(pipelineDir, { recursive: true, force: true })
  })

  async function setupAndSpawn(pipelineCode: string): Promise<Worker> {
    await writeFile(join(pipelineDir, 'pipeline.ts'), pipelineCode)
    const bundlePath = await compilePipeline(pipelineDir)

    worker = new Worker(SHIM_PATH, {
      workerData: {
        bundlePath,
        secrets: { testKey: 'secret123' },
      },
    })
    return worker
  }

  it('sends ready message on startup', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          return { data: 'hello', metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
      }
    `)

    const msg = await waitForMessage(w)
    expect(msg.type).toBe('ready')
  })

  it('executes pipeline and returns data', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute(params) {
          return {
            data: { result: params.x * 2 },
            metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
          }
        }
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'execute', params: { x: 21 } })

    expect(resp.type).toBe('data')
    if (resp.type === 'data') {
      expect(resp.output.data).toEqual({ result: 42 })
    }
  })

  it('returns error for failing execute', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          throw new Error('API down')
        }
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'execute', params: {} })

    expect(resp.type).toBe('error')
    if (resp.type === 'error') {
      expect(resp.error).toContain('API down')
    }
  })

  it('provides getSecret helper via global scope', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          return {
            data: { key: globalThis.getSecret('testKey') },
            metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
          }
        }
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'execute', params: {} })

    expect(resp.type).toBe('data')
    if (resp.type === 'data') {
      expect((resp.output.data as any).key).toBe('secret123')
    }
  })

  it('responds to dispose command', async () => {
    const w = await setupAndSpawn(`
      export default class {
        async execute() {
          return { data: null, metadata: { fetchedAt: Date.now(), source: 'test', cached: false } }
        }
        async dispose() {}
      }
    `)

    await waitForMessage(w) // ready
    const resp = await sendAndWait(w, { type: 'dispose' })
    expect(resp.type).toBe('disposed')
  })
})
