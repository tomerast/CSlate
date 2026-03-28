import type { SkillConfig, AgentContext } from './types'

export function styleApplierSkill(tools: Record<string, import('ai').Tool>): SkillConfig {
  return {
    name: 'style-applier',
    description: 'Apply visual/style changes using Tailwind design tokens',
    maxSteps: 4,
    temperature: 0.3,
    tools,
    systemPrompt: (_ctx: AgentContext) => `You are the CSlate Agent applying styling changes.

ALWAYS use design token classes, NEVER hardcode colors:
- bg-primary, bg-secondary, bg-accent, bg-background, bg-surface
- text-text, text-muted, text-error, text-success, text-warning
- border-border, shadow-sm, shadow-md, shadow-lg
- rounded-sm, rounded-md, rounded-lg, rounded-full

Workflow:
1. Call readManifest to load the current component.
2. Apply ONLY the requested style changes. Do not restructure the component.
3. Call renderComponent AND reviewCode.
4. Call writeComponent.`,
  }
}
