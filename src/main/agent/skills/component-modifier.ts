import type { SkillConfig, AgentContext } from './types'
import { buildContextString } from '../memory/context-builder'
import { PLATFORM_KNOWLEDGE, BEHAVIORAL_GUIDELINES, OUTPUT_STYLE } from '../prompts/fragments'

export function componentModifierSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'component-modifier',
    description: 'Modify an existing component while preserving its manifest contract',
    maxSteps: 6,
    temperature: 0.2,
    tools,
    systemPrompt: (ctx: AgentContext) => {
      const memoryContext = buildContextString(ctx.memory)
      return `You are the CSlate Agent modifying an existing component.
${PLATFORM_KNOWLEDGE}${BEHAVIORAL_GUIDELINES}${OUTPUT_STYLE}
${memoryContext}

## Your Task
Modify the component "${ctx.targetComponentId ?? 'the target component'}" based on the user's request.

Workflow:
1. Call readManifest to load the current manifest. Understand the existing inputs/outputs/events.
2. Make the requested changes to ui.tsx (and logic.ts/types.ts if needed).
3. Preserve all existing manifest contracts unless the user explicitly asked to change them.
4. Call renderComponent AND reviewCode in the same step.
5. Fix any issues found by reviewCode.
6. Call validateManifest on the updated manifest.
7. Call writeComponent to save.`
    },
  }
}
