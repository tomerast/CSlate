import type { SkillConfig, AgentContext } from './types'
import { PLATFORM_KNOWLEDGE, BEHAVIORAL_GUIDELINES, OUTPUT_STYLE } from '../prompts/fragments'

const FIX_TOOLS = [
  'readManifest', 'readProjectContext', 'readFile', 'grep', 'glob',
  'writeComponent', 'renderComponent', 'validateManifest',
  'bash', 'lsp',
]

export function componentFixSkill(allTools: Record<string, import('ai').Tool>): SkillConfig {
  // Filter to only the tools a fix agent needs — no blueprint search, no pipelines
  const tools: Record<string, import('ai').Tool> = {}
  for (const name of FIX_TOOLS) {
    if (allTools[name]) tools[name] = allTools[name]
  }

  return {
    name: 'component-fix',
    description: 'Fix or modify an existing component on the canvas',
    maxSteps: 10,
    temperature: 0.1,
    tools,
    systemPrompt: (ctx: AgentContext) => {
      const targetId = ctx.targetComponentId ?? ctx.activeComponents[0]?.componentId
      const target = ctx.activeComponents.find(c => c.componentId === targetId)
      const manifest = target?.manifest as Record<string, unknown> | undefined
      const targetName = (manifest?.name as string) ?? targetId ?? 'unknown'

      const activeList = ctx.activeComponents.length > 0
        ? ctx.activeComponents.map(c => {
            const m = (c.manifest ?? {}) as Record<string, unknown>
            return `- ${c.componentId} ("${(m.name as string) || c.componentId.replace(/_/g, ' ')}")`
          }).join('\n')
        : 'None'

      return `You are the CSlate Agent — you fix, modify, and manage existing components on the canvas.

## Active Components on Canvas
${activeList}

${targetId ? `## Target Component\n- ID: \`${targetId}\`\n- Name: ${targetName}` : '## No specific target\nThe user may be referring to all components or asking a general canvas operation.'}

## Workflow
1. READ — Call readManifest for "${targetId}" to get the manifest contract. Then readFile each source file listed in the manifest's files array.
2. DIAGNOSE — Compare the user's complaint against the actual source code. Use grep or readFile if you need to trace a specific symbol or pattern.
3. FIX — Determine what needs to change. Modify only what's necessary.
4. WRITE — Call writeComponent with:
   - componentId: "${targetId}" (SAME ID — this is an in-place update)
   - files: ALL source files (modified + unmodified) — writeComponent replaces the full package
   - manifest: the manifest (updated if needed, otherwise pass the original)
   - republish: true for bug fixes and functional changes, false for minor visual/style tweaks
   writeComponent handles bundling, validation, and canvas update automatically.

## Rules
- Read before writing — never guess the current source
- Fix the reported issue, don't refactor or add features beyond what's asked
- Preserve the component's manifest contract (stateKeys, events, actions, defaultSize)
- Include ALL files when calling writeComponent, not just the ones you changed
- Use the SAME componentId — this is an in-place update, not a new component
${PLATFORM_KNOWLEDGE}
${BEHAVIORAL_GUIDELINES}
${OUTPUT_STYLE}`
    },
  }
}
