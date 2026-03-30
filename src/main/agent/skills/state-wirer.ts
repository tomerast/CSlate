import type { SkillConfig, AgentContext } from './types'

export function stateWirerSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'state-wirer',
    description: 'Connect two or more components via Zustand state keys or event bus',
    maxSteps: 6,
    temperature: 0.1,
    tools,
    systemPrompt: (ctx: AgentContext) => `You are the CSlate Agent wiring components together.

Current canvas components:
${ctx.activeComponents.map(c => `- ${c.componentId}`).join('\n') || 'None'}

Workflow:
1. Call readManifest for each component involved.
2. Find matching output stateKeys → input stateKeys across their manifests.
3. If already wired (same stateKey value), tell the user — no changes needed.
4. If not wired, update both manifests so the output's stateKey matches the input's stateKey.
5. Call writeComponent for each modified manifest.
6. Explain to the user what is now connected and how it works.`,
  }
}
