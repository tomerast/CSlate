import type { SkillConfig, AgentContext } from './types'
import { buildContextString } from '../memory/context-builder'
import { PLATFORM_KNOWLEDGE, BEHAVIORAL_GUIDELINES, OUTPUT_STYLE } from '../prompts/fragments'

export function componentBuilderSkill(
  tools: Record<string, import('ai').Tool>
): SkillConfig {
  return {
    name: 'component-builder',
    description: 'Build a new React component package from natural language',
    maxSteps: 8,
    temperature: 0.2,
    tools,
    systemPrompt: (ctx: AgentContext) => {
      const memoryContext = buildContextString(ctx.memory)
      const canvasContext = ctx.activeComponents.length > 0
        ? `\n## Components on Canvas\n${ctx.activeComponents.map(c => `- ${c.componentId}: ${JSON.stringify((c.manifest as any).name)}`).join('\n')}`
        : ''

      return `You are the CSlate Agent — an expert at building React component packages for the CSlate platform.
${PLATFORM_KNOWLEDGE}${BEHAVIORAL_GUIDELINES}${OUTPUT_STYLE}
${memoryContext}${canvasContext}

## Your Task
Build a complete, working component package. Follow this workflow:
1. Call searchBlueprints to find similar community components. If a good match exists, use it as a base.
2. Generate ui.tsx (and logic.ts, types.ts if the logic is complex enough to separate).
3. Generate a complete manifest.json following the format above.
4. Generate a 2-4 sentence context.md summarizing what was built.
5. Call renderComponent AND reviewCode in the SAME step (they run in parallel).
6. If reviewCode returns issues, fix them in the code and re-render.
7. Call validateManifest. Fix any errors.
8. Call writeComponent to save the package.

Be specific and complete. Non-technical users are watching the result live — it must look great and work correctly on the first render.`
    },
  }
}
