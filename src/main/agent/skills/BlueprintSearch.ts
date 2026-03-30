import type { Skill, AgentContext } from '../types'
import type { AgentRequest, AgentResponse } from '@shared/agentTypes'

// v1: searches community DB and presents blueprint options
export class BlueprintSearchSkill implements Skill {
  name = 'blueprint-search'
  description = 'Searches the CSlate community library for matching component blueprints'

  canHandle(request: AgentRequest): boolean {
    const lower = request.message.toLowerCase()
    return lower.includes('search library') || lower.includes('find blueprint')
  }

  async execute(_ctx: AgentContext, _request: AgentRequest): Promise<AgentResponse> {
    return { message: 'Community blueprint search is coming in v1.' }
  }
}
