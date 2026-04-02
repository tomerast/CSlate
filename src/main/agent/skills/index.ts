import type { Tool } from 'ai'
import type { SkillConfig } from './types'
import { componentSearchSkill } from './component-search'
import { stateWirerSkill } from './state-wirer'
import { pipelineWirerSkill } from './pipeline-wirer'

export type { SkillConfig, AgentContext } from './types'

/** Legacy skills still routed directly (not via orchestrator). */
export type LegacySkillName = 'state-wirer' | 'component-search' | 'pipeline-wirer'

export function buildSkillRegistry(
  tools: Record<string, Tool>,
): Record<LegacySkillName, SkillConfig> {
  return {
    'component-search': componentSearchSkill(tools),
    'state-wirer': stateWirerSkill(tools),
    'pipeline-wirer': pipelineWirerSkill(tools),
  }
}
