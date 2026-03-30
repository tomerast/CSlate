import type { Tool } from 'ai'
import { z } from 'zod'
import { ComponentManifestSchema } from '@cslate/shared'

type ValidateManifestInput = { manifest: unknown }
type ValidateManifestOutput = { valid: boolean; errors: string[] }

export const validateManifest: Tool<ValidateManifestInput, ValidateManifestOutput> = {
  description: 'Validate a component manifest against the CSlate schema. Always call this before writeComponent.',
  inputSchema: z.object({
    manifest: z.any().describe('The manifest object to validate'),
  }) as any,
  execute: async (input: ValidateManifestInput): Promise<ValidateManifestOutput> => {
    const result = ComponentManifestSchema.safeParse(input.manifest)
    if (result.success) {
      return { valid: true, errors: [] }
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return { valid: false, errors }
  },
}
