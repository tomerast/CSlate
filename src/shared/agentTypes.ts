/**
 * Shared conversation types used by both main and renderer.
 *
 * These mirror the AgentMessage / Session schemas that will land in
 * @cslate/shared v0.4 (Phase 2 T2.1). Kept local for now so the client
 * can pivot without blocking on a shared-package release.
 */

export type Role = 'user' | 'assistant' | 'system'

export interface MessageCard {
  bundle: string
  manifest: unknown
  componentId?: string
  source: 'server' | 'generated'
  score?: number
}

export interface AgentMessage {
  id: string
  role: Role
  content: string
  cards: MessageCard[]
  createdAt: number
}

export interface SessionSummary {
  id: string
  title: string
  modelId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface Session extends Omit<SessionSummary, 'messageCount'> {
  messages: AgentMessage[]
}

export interface PipelineBuildPlanEvent {
  type: 'pipeline-plan'
  pipelines: Array<{
    pipelineId: string
    requirements: string
  }>
  wiring: Array<{
    componentId: string
    pipelineId: string
  }>
}
