import type { Skill } from '../types'
import type { AgentRequest } from '@shared/agentTypes'
import { ComponentBuilderSkill } from './ComponentBuilder'
import { StateWirerSkill } from './StateWirer'
import { BlueprintSearchSkill } from './BlueprintSearch'

export class SkillRegistry {
  // More specific skills checked first; ComponentBuilder is catch-all (always last)
  private skills: Skill[] = [
    new StateWirerSkill(),
    new BlueprintSearchSkill(),
    new ComponentBuilderSkill()
  ]

  async resolve(request: AgentRequest): Promise<Skill> {
    for (const skill of this.skills) {
      if (await skill.canHandle(request)) return skill
    }
    throw new Error('No skill found for request')
  }
}
