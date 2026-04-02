import { z } from 'zod'

// ── Strategy ──────────────────────────────────────────────

export const PipelineStrategySchema = z.object({
  type: z.enum(['on-demand', 'polling', 'streaming']),
  intervalMs: z.number().int().positive().optional(),
  cacheTtlMs: z.number().int().nonnegative().optional(),
})

// ── Manifest ──────────────────────────────────────────────

export const PipelineSecretSchema = z.object({
  description: z.string(),
  required: z.boolean(),
})

export const PipelineParamSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object']),
  description: z.string(),
  required: z.boolean(),
  default: z.unknown().optional(),
})

export const PipelineOutputFieldSchema = z.object({
  type: z.string(),
  description: z.string(),
})

export const PipelineManifestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  tags: z.array(z.string()).max(20),
  secrets: z.record(PipelineSecretSchema),
  params: z.record(PipelineParamSchema),
  outputSchema: z.record(PipelineOutputFieldSchema),
  strategy: PipelineStrategySchema,
  files: z.array(z.string()),
  version: z.string().optional(),
})

export type PipelineManifest = z.infer<typeof PipelineManifestSchema>

// ── Output ────────────────────────────────────────────────

export const PipelineOutputMetadataSchema = z.object({
  fetchedAt: z.number(),
  source: z.string(),
  cached: z.boolean(),
})

export const PipelineOutputSchema = z.object({
  data: z.unknown(),
  metadata: PipelineOutputMetadataSchema,
})

export type PipelineOutput = z.infer<typeof PipelineOutputSchema>

// ── DataPipeline interface (for pipeline.ts implementations) ──

export interface DataPipeline {
  execute(params: Record<string, unknown>): Promise<PipelineOutput>
  stream?(
    params: Record<string, unknown>,
    push: (data: PipelineOutput) => void,
  ): Promise<() => void>
  dispose?(): Promise<void>
}

// ── Registry (pipelines.json) ─────────────────────────────

export const PipelineEntrySchema = z.object({
  pipelineId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  status: z.enum(['active', 'inactive', 'error']),
  lastRun: z.number().optional(),
  error: z.string().optional(),
  connectedComponents: z.array(z.string()),
})

export type PipelineEntry = z.infer<typeof PipelineEntrySchema>

export const PipelinesJsonSchema = z.object({
  pipelines: z.array(PipelineEntrySchema),
})

export type PipelinesJson = z.infer<typeof PipelinesJsonSchema>

// ── Status (runtime) ──────────────────────────────────────

export type PipelineState = 'idle' | 'running' | 'polling' | 'streaming' | 'error' | 'stopped'

export interface PipelineStatus {
  pipelineId: string
  state: PipelineState
  lastOutput?: PipelineOutput
  lastError?: string
  uptimeMs?: number
  nextPollAt?: number
}

// ── Worker protocol ───────────────────────────────────────

export type WorkerCommand =
  | { type: 'execute'; params: Record<string, unknown> }
  | { type: 'stream'; params: Record<string, unknown> }
  | { type: 'dispose' }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'data'; output: PipelineOutput }
  | { type: 'error'; error: string }
  | { type: 'disposed' }

// ── Package validation ────────────────────────────────────

export const PipelinePackageSchema = z.object({
  manifest: PipelineManifestSchema,
  files: z.record(z.string()).superRefine((files, ctx) => {
    if (!('pipeline.ts' in files)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pipeline.ts is required — it is the pipeline entry point',
        path: ['pipeline.ts'],
      })
    }
    for (const filePath of Object.keys(files)) {
      if (filePath.includes('..')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Path traversal not allowed: "${filePath}"`,
          path: [filePath],
        })
      }
      if (filePath.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Absolute paths not allowed: "${filePath}"`,
          path: [filePath],
        })
      }
      if (filePath.includes('\0')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Null bytes not allowed in path: "${filePath}"`,
          path: [filePath],
        })
      }
    }
  }),
})

export type PipelinePackage = z.infer<typeof PipelinePackageSchema>

export type PackageValidationResult =
  | { valid: true; pkg: PipelinePackage }
  | { valid: false; errors: string[] }

export function validatePipelinePackage(pkg: unknown): PackageValidationResult {
  const result = PipelinePackageSchema.safeParse(pkg)
  if (result.success) return { valid: true, pkg: result.data }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  })
  return { valid: false, errors }
}

// ── Pipeline ID validation ────────────────────────────────

const PIPELINE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/
export function isValidPipelineId(id: string): boolean {
  return PIPELINE_ID_RE.test(id)
}
