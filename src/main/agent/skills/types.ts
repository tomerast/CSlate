import type { MemoryFiles } from '../memory/index'

export interface AgentContext {
  projectDir: string
  tabId: string
  memory: MemoryFiles
  activeComponents: Array<{ componentId: string; manifest: unknown }>
  targetComponentId?: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface SkillConfig {
  name: string
  description: string
  systemPrompt: (ctx: AgentContext) => string
  tools: Record<string, import('ai').Tool>
  maxSteps?: number
  maxTokens?: number
  temperature?: number
}
