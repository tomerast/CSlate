import type { WebContents } from 'electron'
import type { Logger } from 'pino'
import {
  buildRegistry,
  mainModelId,
  fastModelId,
  runAgentStream,
  autoCompactIfNeeded,
  type LLMConfig,
  type AgentRegistry,
} from '@cslate/shared/agent'
import { classifyIntent } from './router'
import { loadUserMemory } from '../memory/context'
import { buildSkillRegistry, type AgentContext } from './skills/index'
import { Orchestrator } from './orchestrator/index'
import type { OrchestratorContext } from './orchestrator/types'
import { buildToolSet } from './tools/index'
import type { PermissionBroker } from './tools/bash/permissions'
import { createReadProjectContextCSTool } from './tools/readProjectContext'
import { CSlateServerClient } from '../server/CSlateServerClient'
import { runRenderSkill } from './skills/render-decision/index'
import { engineLog } from '../lib/logger'

export interface EngineOptions {
  serverUrl: string
  serverApiKey: string
  sender: WebContents
  tabId: string
  permissionBroker?: PermissionBroker
}

export interface RunInput {
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  targetComponentId?: string
}

export class AgentEngine {
  private registry: AgentRegistry

  constructor(
    private config: LLMConfig,
    private projectDir: string,
    private options: EngineOptions
  ) {
    this.registry = buildRegistry(config)
  }

  async *stream(input: RunInput): AsyncGenerator<unknown> {
    const log = engineLog.child({ tabId: this.options.tabId })

    // Create abort controller for this stream — can be cancelled via IPC
    const abortController = new AbortController()

    // Compact conversation if approaching context limit
    const compactedHistory = autoCompactIfNeeded(
      input.conversationHistory.map(m => ({ role: m.role, content: m.content }))
    ).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const compactedInput = { ...input, conversationHistory: compactedHistory }

    // Load context upfront — needed for both routing and execution
    const [userMemory, activeComponents] = await Promise.all([
      loadUserMemory(),
      this.loadActiveComponents(),
    ])

    // Route intent with full context
    log.debug({ message: input.message }, 'routing intent')
    const route = await classifyIntent(
      input.message,
      compactedInput.conversationHistory,
      activeComponents.map((c) => {
        const m = (c.manifest ?? {}) as Record<string, unknown>
        return {
          componentId: c.componentId,
          name: (m.name as string) ?? undefined,
          description: (m.description as string) ?? undefined,
        }
      }),
      this.config,
      this.registry
    )
    log.info({ route: route.route, skill: route.skill, summary: route.summary }, 'intent routed')

    // Dispatch based on new chat-portal taxonomy
    if (route.route === 'render') {
      yield* this.runRender(compactedInput, userMemory, log, abortController)
    } else if (route.route === 'build') {
      yield* this.runOrchestrator(compactedInput, route, userMemory, activeComponents, log, abortController)
    } else if (route.route === 'skill' && route.skill) {
      yield* this.runSkill(route.skill, compactedInput, route, userMemory, activeComponents, log, abortController)
    } else {
      yield* this.runDirect(compactedInput, log, abortController)
    }
  }

  private async *runRender(
    input: RunInput,
    userMemory: string,
    log: Logger,
    abortController?: AbortController,
  ): AsyncGenerator<unknown> {
    log.info('running render-decision skill')
    yield* runRenderSkill({
      message: input.message,
      conversationHistory: input.conversationHistory,
      userMemory,
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      config: this.config,
      registry: this.registry,
      serverUrl: this.options.serverUrl,
      serverApiKey: this.options.serverApiKey,
      sender: this.options.sender,
      abortSignal: abortController?.signal,
    })
  }

  private async *runOrchestrator(
    input: RunInput,
    route: { summary: string; targetComponentId?: string | null },
    userMemory: string,
    activeComponents: Array<{ componentId: string; manifest: unknown }>,
    log: Logger,
    abortController?: AbortController
  ): AsyncGenerator<unknown> {
    const serverClient = (this.options.serverUrl && this.options.serverApiKey)
      ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
      : null

    const orchCtx: OrchestratorContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      userMemory,
      activeComponents,
      targetComponentId: input.targetComponentId ?? route.targetComponentId ?? undefined,
      conversationHistory: input.conversationHistory,
      config: this.config,
      registry: this.registry,
      serverClient,
      sender: this.options.sender,
      permissionBroker: this.options.permissionBroker,
    }

    const orchestrator = new Orchestrator(orchCtx)
    const t0 = Date.now()
    for await (const part of orchestrator.stream(input.message)) {
      yield part
    }
    log.info({ durationMs: Date.now() - t0, summary: route.summary, abortController: !!abortController }, 'orchestrator stream finished')
  }

  private async *runSkill(
    skillName: string,
    input: RunInput,
    route: { targetComponentId?: string | null },
    userMemory: string,
    activeComponents: Array<{ componentId: string; manifest: unknown }>,
    log: Logger,
    abortController?: AbortController
  ): AsyncGenerator<unknown> {
    const serverClient = (this.options.serverUrl && this.options.serverApiKey)
      ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
      : null

    const ctx: AgentContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      userMemory,
      activeComponents,
      targetComponentId: input.targetComponentId ?? route.targetComponentId ?? undefined,
      conversationHistory: input.conversationHistory,
    }

    const { aiTools } = buildToolSet({
      projectDir: this.projectDir,
      registry: this.registry,
      fastModelId: fastModelId(this.config),
      serverClient,
      permissionBroker: this.options.permissionBroker,
    })

    const skillRegistry = buildSkillRegistry(aiTools)
    const skill = skillRegistry[skillName as keyof typeof skillRegistry]
    if (!skill) {
      yield { type: 'text-delta', text: `Unknown skill: ${skillName}` }
      return
    }

    const modelId = mainModelId(this.config)
    log.info({ modelId, skill: skillName }, 'running skill')
    const t0 = Date.now()

    const result = runAgentStream({
      modelId,
      registry: this.registry,
      system: skill.systemPrompt(ctx),
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
      tools: skill.tools,
      maxSteps: skill.maxSteps ?? 10,
      maxOutputTokens: skill.maxTokens,
      temperature: skill.temperature,
      abortSignal: abortController?.signal,
    })

    for await (const part of result.fullStream) {
      yield part
    }

    Promise.resolve(result.usage).then(usage => {
      log.info({ durationMs: Date.now() - t0, totalTokens: (usage as any)?.totalTokens }, 'skill stream finished')
    }).catch(() => {})
  }

  private async *runDirect(
    input: RunInput,
    log: Logger,
    abortController?: AbortController
  ): AsyncGenerator<unknown> {
    const modelId = mainModelId(this.config)
    log.info({ modelId }, 'running direct response')

    const result = runAgentStream({
      modelId,
      registry: this.registry,
      system: 'You are the CSlate assistant. Answer the user\'s question helpfully and concisely. You do not have access to tools in this mode.',
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
      tools: {},
      maxOutputTokens: 1000,
      abortSignal: abortController?.signal,
    })

    for await (const part of result.fullStream) {
      yield part
    }
  }

  private async loadActiveComponents(): Promise<Array<{ componentId: string; manifest: unknown }>> {
    const tool = createReadProjectContextCSTool(this.projectDir)
    try {
      const result = await tool.call({ includeSourceSummaries: false })
      return (result.data as any).components ?? []
    } catch {
      return []
    }
  }
}
