import type { Skill, AgentContext } from '../types'
import type { AgentRequest, AgentResponse } from '@shared/agentTypes'
import { COMPONENT_BUILDER_PROMPT } from '../prompts/ComponentBuilder'

export class ComponentBuilderSkill implements Skill {
  name = 'component-builder'
  description = 'Generates and modifies React components from natural language'

  canHandle(_request: AgentRequest): boolean {
    return true // catch-all — always last in registry
  }

  async execute(ctx: AgentContext, request: AgentRequest): Promise<AgentResponse> {
    const memories = await ctx.memory.getAll()
    const memCtx = memories.length > 0
      ? '\n\nUser context:\n' + memories.map(m => `[${m.type}] ${m.content}`).join('\n')
      : ''

    const systemPrompt = COMPONENT_BUILDER_PROMPT + memCtx

    // When iterating, inject the current component code so the model knows what to modify
    const userContent = request.currentCode
      ? `Current component code:\n\`\`\`jsx\n${request.currentCode}\n\`\`\`\n\nUser request: ${request.message}`
      : request.message

    const messages = [
      ...request.history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userContent }
    ]

    const llmResponse = await ctx.llm.complete({
      system: systemPrompt,
      messages,
      maxTokens: 4096
    })

    if (request.history.length > 0) {
      await ctx.memory.save({
        type: 'feedback',
        name: `iteration_${Date.now()}`,
        description: `User refinement: ${request.message.slice(0, 60)}`,
        content: `User requested modification: "${request.message}"`
      })
    }

    return {
      message: "Here's your component. Let me know if you'd like any changes.",
      componentCode: llmResponse.content
    }
  }
}
