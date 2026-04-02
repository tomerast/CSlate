export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
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
