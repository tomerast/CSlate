import type { Tool } from 'ai'
import type { SkillConfig } from './types'
import { componentBuilderSkill } from './component-builder'
import { componentModifierSkill } from './component-modifier'
import { manifestGeneratorSkill } from './manifest-generator'
import { componentSearchSkill } from './component-search'
import { stateWirerSkill } from './state-wirer'
import { feedbackIteratorSkill } from './feedback-iterator'
import { styleApplierSkill } from './style-applier'
import type { SkillName } from '../intent'

export type { SkillConfig, AgentContext } from './types'

export function buildSkillRegistry(tools: Record<string, Tool>): Record<SkillName, SkillConfig> {
  return {
    'component-builder': componentBuilderSkill(tools),
    'component-modifier': componentModifierSkill(tools),
    'manifest-generator': manifestGeneratorSkill(tools),
    'component-search': componentSearchSkill(tools),
    'state-wirer': stateWirerSkill(tools),
    'feedback-iterator': feedbackIteratorSkill(tools),
    'style-applier': styleApplierSkill(tools),
  }
}
