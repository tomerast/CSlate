import type { AgentRequest, AgentResponse } from '@shared/agentTypes'
import type { LLMClient } from './llm/types'
import type { MemoryManager } from './memory/MemoryManager'
import type { ToolRegistry } from './tools/index'

export type { AgentRequest, AgentResponse }

export interface AgentContext {
  sessionId: string
  request: AgentRequest
  memory: MemoryManager
  tools: ToolRegistry
  llm: LLMClient
}

export interface Skill {
  name: string
  description: string
  canHandle(request: AgentRequest): boolean | Promise<boolean>
  execute(ctx: AgentContext, request: AgentRequest): Promise<AgentResponse>
}
