import type { AgentRequest, AgentResponse } from '@shared/agentTypes'
import type { AgentContext } from './types'
import { SkillRegistry } from './skills'
import { ToolRegistry } from './tools'
import { MemoryManager } from './memory/MemoryManager'
import { createLLMClient } from './llm'

export class AgentRunner {
  private skills = new SkillRegistry()
  private tools = new ToolRegistry()

  async run(request: AgentRequest, apiKey: string): Promise<AgentResponse> {
    const llm = createLLMClient('anthropic', apiKey)
    const memory = new MemoryManager(request.projectDir ?? null)

    const ctx: AgentContext = {
      sessionId: request.sessionId,
      request,
      memory,
      tools: this.tools,
      llm
    }

    const skill = await this.skills.resolve(request)
    return skill.execute(ctx, request)
  }
}
