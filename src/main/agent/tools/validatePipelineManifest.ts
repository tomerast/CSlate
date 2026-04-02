import { z } from 'zod'
import { buildTool } from './types'
import { PipelineManifestSchema } from '../../pipeline/types'

export function createValidatePipelineManifestTool() {
  return buildTool({
    name: 'validatePipelineManifest',
    description:
      'Validate a pipeline manifest against the PipelineManifest schema. Call this BEFORE writePipeline to catch errors early.',
    inputSchema: z.object({
      manifest: z.unknown().describe('The pipeline manifest object to validate'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
    call: async ({ manifest }: { manifest: unknown }) => {
      const result = PipelineManifestSchema.safeParse(manifest)
      if (result.success) {
        return { data: { valid: true, errors: [] as string[] } }
      }
      const errors = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })
      return { data: { valid: false, errors } }
    },
  })
}
