import type { Tool } from 'ai'
import type { SkillConfig } from './types'
import { componentSearchSkill } from './component-search'
import { stateWirerSkill } from './state-wirer'
import { pipelineWirerSkill } from './pipeline-wirer'
import { componentFixSkill } from './component-fix'

export type { SkillConfig, AgentContext } from './types'

/** Skills routed directly (not via orchestrator). */
export type SkillName = 'state-wirer' | 'component-search' | 'pipeline-wirer' | 'component-fix'

/** @deprecated Use SkillName instead */
export type LegacySkillName = SkillName

export function buildSkillRegistry(
  tools: Record<string, Tool>,
): Record<SkillName, SkillConfig> {
  return {
    'component-search': componentSearchSkill(tools),
    'state-wirer': stateWirerSkill(tools),
    'pipeline-wirer': pipelineWirerSkill(tools),
    'component-fix': componentFixSkill(tools),
  }
}
