import { tool } from 'ai'
import { z } from 'zod'
import { ComponentManifestSchema } from '@cslate/shared'

export const validateManifest = tool({
  description: 'Validate a component manifest against the CSlate schema. Always call this before writeComponent.',
  parameters: z.object({
    manifest: z.unknown().describe('The manifest object to validate'),
  }),
  execute: async ({ manifest }) => {
    const result = ComponentManifestSchema.safeParse(manifest)
    if (result.success) {
      return { valid: true, errors: [] as string[] }
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return { valid: false, errors }
  },
})
