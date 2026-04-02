import { z } from 'zod'
import type { MemoryFiles } from '../memory/index'

// --- Zod Schemas ---

export const BuildTaskSchema = z.object({
  file: z.string().describe('Filename to build, e.g. "ui.tsx", "logic.ts", "types.ts"'),
  assignment: z.string().describe('What to build or adapt in this file'),
  blueprint: z.string().nullable().describe('Base code to adapt, or null to build from scratch'),
})

export const BlueprintMatchSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  similarity: z.number().min(0).max(1),
  source: z.record(z.string()),
  strength: z.enum(['strong', 'weak', 'none']),
})

export const SubAgentResultSchema = z.object({
  file: z.string(),
  code: z.string(),
  status: z.enum(['success', 'error']),
  error: z.string().nullable(),
})

export const ComponentPlanSchema = z.object({
  componentId: z.string(),
  requirements: z.string(),
  contract: z.string().describe('Shared TypeScript interfaces / prop types'),
  tasks: z.array(BuildTaskSchema).min(1),
  blueprintMatch: BlueprintMatchSchema.nullable(),
})

export const PipelinePlanSchema = z.object({
  pipelineId: z.string(),
  requirements: z.string(),
  tasks: z.array(BuildTaskSchema).min(1),
  blueprintMatch: BlueprintMatchSchema.nullable(),
})

export const WiringPlanSchema = z.object({
  componentId: z.string(),
  pipelineId: z.string(),
  mappings: z.record(z.string()),
})

export const BuildPlanSchema = z.object({
  components: z.array(ComponentPlanSchema),
  pipelines: z.array(PipelinePlanSchema),
  wiring: z.array(WiringPlanSchema),
})

// --- TypeScript Types ---

export type BuildTask = z.infer<typeof BuildTaskSchema>
export type BlueprintMatch = z.infer<typeof BlueprintMatchSchema>
export type SubAgentResult = z.infer<typeof SubAgentResultSchema>
export type ComponentPlan = z.infer<typeof ComponentPlanSchema>
export type PipelinePlan = z.infer<typeof PipelinePlanSchema>
export type WiringPlan = z.infer<typeof WiringPlanSchema>
export type BuildPlan = z.infer<typeof BuildPlanSchema>

export interface OrchestratorContext {
  projectDir: string
  tabId: string
  memory: MemoryFiles
  activeComponents: Array<{ componentId: string; manifest: unknown }>
  targetComponentId?: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  config: import('@cslate/shared/agent').LLMConfig
  registry: { languageModel: (id: string) => any }
  serverClient: import('../../server/CSlateServerClient').CSlateServerClient | null
  sender: import('electron').WebContents
  permissionBroker?: { request(command: string): Promise<boolean> }
}

export type OrchestratorPhase =
  | 'understand'
  | 'search'
  | 'plan'
  | 'dispatch'
  | 'assemble'
  | 'validate'
  | 'ship'
  | 'fix'
