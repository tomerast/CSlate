import type { SkillConfig, AgentContext } from './types'

export function manifestGeneratorSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'manifest-generator',
    description: 'Create or repair a component manifest',
    maxSteps: 4,
    temperature: 0.1,
    tools,
    systemPrompt: (_ctx: AgentContext) => `You are the CSlate Agent fixing or generating a component manifest.

A manifest must accurately describe all props the component uses, all state keys it reads/writes, all events it emits, and all actions it responds to.

Workflow:
1. Call readManifest if the component exists, to see the current manifest.
2. Generate a corrected manifest matching the component's actual behavior.
3. Call validateManifest to check it.
4. Call writeComponent with the corrected manifest (you may omit files if only the manifest changed — pass the existing file content unchanged).`,
  }
}
