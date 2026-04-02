import { z } from 'zod'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { buildTool, type ToolResult, type ToolUseContext } from './types'
import { isValidPipelineId, PipelineManifestSchema } from '../../pipeline/types'
import { compilePipeline } from '../../pipeline/compiler'
import { upsertPipelineEntry } from '../../pipeline/pipelines-json'
import { stripFences } from '@cslate/shared/agent'
import { safePath } from '../../lib/paths'

type WritePipelineInput = { pipelineId: string; files: Record<string, string>; manifest: unknown }
type WritePipelineOutput = { success: boolean; errors?: string[]; path?: string; bundle?: string }

export function createWritePipelineTool() {
  return buildTool<WritePipelineInput, WritePipelineOutput>({
    name: 'writePipeline',
    description:
      'Write a data pipeline to disk. Writes source files, compiles the worker bundle, and registers in pipelines.json. Call validatePipelineManifest first.',
    inputSchema: z.object({
      pipelineId: z.string().describe('Snake_case pipeline ID (e.g. "yahoo_stocks")'),
      files: z.record(z.string()).describe('Source files: { "pipeline.ts": "...", "types.ts": "...", ... }'),
      manifest: z.unknown().describe('Pipeline manifest object'),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async (
      { pipelineId, files, manifest },
      context?: ToolUseContext,
    ): Promise<ToolResult<WritePipelineOutput>> => {
      // Validate ID
      if (!isValidPipelineId(pipelineId)) {
        return {
          data: {
            success: false,
            errors: [`Invalid pipeline ID "${pipelineId}". Must match /^[a-z0-9][a-z0-9_-]*$/`],
          },
        }
      }

      // Validate manifest
      const manifestResult = PipelineManifestSchema.safeParse(manifest)
      if (!manifestResult.success) {
        const errors = manifestResult.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        )
        return { data: { success: false, errors } }
      }

      const projectDir = context?.projectDir ?? ''
      const pipelinesRoot = join(projectDir, 'pipelines')
      const pipelineDir = safePath(pipelinesRoot, pipelineId)

      try {
        // Write source files
        await mkdir(pipelineDir, { recursive: true })

        for (const [name, content] of Object.entries(files)) {
          const target = safePath(pipelineDir, name)
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, stripFences(content))
        }

        // Write manifest.json
        await writeFile(
          join(pipelineDir, 'manifest.json'),
          JSON.stringify(manifestResult.data, null, 2),
        )

        // Compile worker bundle
        const bundlePath = await compilePipeline(pipelineDir)

        // Update pipelines.json
        await upsertPipelineEntry(projectDir, {
          pipelineId,
          status: 'inactive',
          connectedComponents: [],
        })

        return {
          data: {
            success: true,
            path: pipelineDir,
            bundle: bundlePath,
          },
        }
      } catch (err) {
        return {
          data: {
            success: false,
            errors: [(err as Error).message],
          },
        }
      }
    },
  })
}
