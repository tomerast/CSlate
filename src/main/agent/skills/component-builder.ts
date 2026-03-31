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
Build a complete, working component package. Follow this exact workflow in order:
1. Call searchBlueprints to find similar community components.
2. Generate all source files: ui.tsx is required. Add logic.ts, types.ts if needed.
3. Call validateManifest to validate the manifest. Fix any errors before continuing.
4. Call renderComponent to preview the component on canvas.
5. Call reviewCode in the same step as renderComponent (they run in parallel).
6. If reviewCode returns issues, fix the code and call renderComponent again.
7. ALWAYS call writeComponent as the final step to save the component to disk. This is REQUIRED — the component is NOT saved until you call writeComponent.

Do not stop after renderComponent. You MUST call writeComponent to complete the task.`
    },
  }
}
