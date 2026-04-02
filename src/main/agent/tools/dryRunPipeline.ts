import { z } from 'zod'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { buildTool, type ToolResult } from './types'
import { compilePipelineFromFiles } from '../../pipeline/compiler'
import type { WorkerResponse, PipelineOutput } from '../../pipeline/types'

const SHIM_PATH = join(__dirname, '..', '..', 'pipeline', 'worker-shim.js')
const TIMEOUT_MS = 30_000

type DryRunInput = {
  files: Record<string, string>
  params?: Record<string, unknown>
  secrets?: Record<string, string>
}
type DryRunOutput = { success: boolean; output?: PipelineOutput; errors?: string[]; executionTimeMs: number }

export function createDryRunPipelineTool() {
  return buildTool<DryRunInput, DryRunOutput>({
    name: 'dryRunPipeline',
    description:
      'Execute a pipeline once with real data to verify it works. Returns sample output and execution time. Use this to test pipeline code before writing to disk.',
    inputSchema: z.object({
      files: z.record(z.string()).describe('Pipeline source files (must include pipeline.ts)'),
      params: z.record(z.unknown()).optional().describe('Params to pass to execute()'),
      secrets: z.record(z.string()).optional().describe('Secrets to inject (for testing)'),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async ({
      files,
      params = {},
      secrets = {},
    }: DryRunInput): Promise<ToolResult<DryRunOutput>> => {
      const startTime = Date.now()

      // Compile to temp bundle
      let bundleCode: string
      try {
        bundleCode = await compilePipelineFromFiles(files)
      } catch (err) {
        return {
          data: {
            success: false,
            errors: [`Compilation failed: ${(err as Error).message}`],
            executionTimeMs: Date.now() - startTime,
          },
        }
      }

      // Write bundle to temp file (Worker needs a file path)
      const tempDir = await mkdtemp(join(tmpdir(), 'cslate-dryrun-'))
      const bundlePath = join(tempDir, 'worker-bundle.js')
      await writeFile(bundlePath, bundleCode)

      try {
        const output = await new Promise<PipelineOutput>((resolve, reject) => {
          let settled = false

          const worker = new Worker(SHIM_PATH, {
            workerData: { bundlePath, secrets },
          })

          const cleanup = () => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            worker.terminate()
          }

          const timeout = setTimeout(() => {
            cleanup()
            reject(new Error(`Execution timed out after ${TIMEOUT_MS}ms`))
          }, TIMEOUT_MS)

          worker.on('message', (msg: WorkerResponse) => {
            if (msg.type === 'ready') {
              worker.postMessage({ type: 'execute', params })
            } else if (msg.type === 'data') {
              cleanup()
              resolve(msg.output)
            } else if (msg.type === 'error') {
              cleanup()
              reject(new Error(msg.error))
            }
          })

          worker.on('error', (err) => {
            cleanup()
            reject(err)
          })
        })

        return {
          data: {
            success: true,
            output,
            executionTimeMs: Date.now() - startTime,
          },
        }
      } catch (err) {
        return {
          data: {
            success: false,
            errors: [(err as Error).message],
            executionTimeMs: Date.now() - startTime,
          },
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    },
  })
}
