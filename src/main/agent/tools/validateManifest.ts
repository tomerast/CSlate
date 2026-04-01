import type { Tool } from 'ai'
import { z } from 'zod'
import { ComponentManifestSchema } from '@cslate/shared'
import { buildTool } from './types'

type ValidateManifestInput = { manifest: unknown }
type ValidateManifestOutput = { valid: boolean; errors: string[] }

export const validateManifestTool = buildTool<ValidateManifestInput, ValidateManifestOutput>({
  name: 'validateManifest',
  description: 'Validate a component manifest against the CSlate schema. Always call this before writeComponent.',
  inputSchema: z.object({
    manifest: z.any().describe('The manifest object to validate'),
  }) as any,
  call: async (input: ValidateManifestInput) => {
    const result = ComponentManifestSchema.safeParse(input.manifest)
    if (result.success) {
      return { data: { valid: true, errors: [] } }
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return { data: { valid: false, errors } }
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
})

/**
 * @deprecated Use validateManifestTool.toAISDKTool() instead.
 * Kept for backward compatibility.
 */
export const validateManifest: Tool<ValidateManifestInput, ValidateManifestOutput> = validateManifestTool.toAISDKTool()
