import type { Tool } from 'ai'
import type { SkillConfig } from './types'
import { componentSearchSkill } from './component-search'
import { componentFixSkill } from './component-fix'

export type { SkillConfig, AgentContext } from './types'

/** Skills routed directly (not via orchestrator). */
export type SkillName = 'component-search' | 'component-fix'

export function buildSkillRegistry(
  tools: Record<string, Tool>,
): Record<SkillName, SkillConfig> {
  return {
    'component-search': componentSearchSkill(tools),
    'component-fix': componentFixSkill(tools),
  }
}
