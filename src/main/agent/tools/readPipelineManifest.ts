import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildTool, type ToolResult, type ToolUseContext } from './types'
import { safePath } from '../../lib/paths'

type ReadPipelineManifestOutput = { manifest: unknown; error?: undefined } | { error: string; manifest?: undefined }

export function createReadPipelineManifestTool() {
  return buildTool<{ pipelineId: string }, ReadPipelineManifestOutput>({
    name: 'readPipelineManifest',
    description: 'Read the manifest.json of an existing pipeline by its ID.',
    inputSchema: z.object({
      pipelineId: z.string().describe('The pipeline ID (e.g. "yahoo_stocks")'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ pipelineId }, context?: ToolUseContext): Promise<ToolResult<ReadPipelineManifestOutput>> => {
      try {
        const projectDir = context?.projectDir ?? ''
        const pipelineDir = safePath(join(projectDir, 'pipelines'), pipelineId)
        const manifestPath = join(pipelineDir, 'manifest.json')
        const raw = await readFile(manifestPath, 'utf-8')
        return { data: { manifest: JSON.parse(raw) as unknown } }
      } catch (err) {
        return {
          data: { error: `Could not read pipeline "${pipelineId}": ${(err as Error).message}` },
        }
      }
    },
  })
}
