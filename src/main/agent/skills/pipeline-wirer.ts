import type { SkillConfig, AgentContext } from './types'
import { PIPELINE_COMPONENT_WIRING, BEHAVIORAL_GUIDELINES, OUTPUT_STYLE } from '../prompts/fragments'

export function pipelineWirerSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'pipeline-wirer',
    description: 'Connect an existing data pipeline to an existing component',
    maxSteps: 8,
    temperature: 0.1,
    tools,
    systemPrompt: (ctx: AgentContext) => `You are the CSlate Agent connecting data pipelines to components.
${BEHAVIORAL_GUIDELINES}${OUTPUT_STYLE}
${PIPELINE_COMPONENT_WIRING}

Current canvas components:
${ctx.activeComponents.map((c) => `- ${c.componentId}`).join('\n') || 'None'}

Workflow:
1. Use readPipelineManifest to understand what data the pipeline provides.
2. Use readManifest to understand what data the component needs.
3. Update the component's code to use bridge.pipeline() or bridge.pipelineSubscribe() for live data.
4. Update the component's manifest to declare the pipeline dependency.
5. Call writeComponent for the modified component.
6. Explain to the user what is now connected and how it works.`,
  }
}
