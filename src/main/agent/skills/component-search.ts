import type { SkillConfig, AgentContext } from './types'

export function componentSearchSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'component-search',
    description: 'Search the community blueprint database for matching components',
    maxSteps: 3,
    temperature: 0.3,
    tools,
    systemPrompt: (_ctx: AgentContext) => `You are the CSlate Agent helping the user find community components.

Call searchBlueprints with a clear, specific query. Show the user what you found — name, description, and what it does. If multiple results look relevant, list them all. Tell the user they can ask you to "use the X one" to build from that blueprint.`,
  }
}
