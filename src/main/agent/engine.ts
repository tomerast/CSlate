import { streamText, stepCountIs } from 'ai'
import type { WebContents } from 'electron'
import type { Logger } from 'pino'
import { buildRegistry, mainModelId, fastModelId, type LLMConfig } from './providers'
import { classifyIntent } from './router'
import { readMemory, writeMemoryEntry } from './memory/index'
import { buildSkillRegistry, type AgentContext } from './skills/index'
import { Orchestrator } from './orchestrator/index'
import type { OrchestratorContext } from './orchestrator/types'
import { buildToolSet } from './tools/index'
import type { PermissionBroker } from './tools/bash/permissions'
import { createReadProjectContextCSTool } from './tools/readProjectContext'
import { CSlateServerClient } from '../server/CSlateServerClient'
import { autoCompactIfNeeded } from './lib/compact'
import { createChildAbortController } from './lib/abortUtils'
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
  private registry: ReturnType<typeof buildRegistry>

  constructor(
    private config: LLMConfig,
    private projectDir: string,
    private options: EngineOptions
  ) {
    this.registry = buildRegistry(config)
  }

  async *stream(input: RunInput): AsyncGenerator<unknown> {
    const log = engineLog.child({ tabId: this.options.tabId })
    const reg = this.registry as { languageModel: (id: string) => any }

    // Create abort controller for this stream — can be cancelled via IPC
    const abortController = new AbortController()

    // Compact conversation if approaching context limit
    const compactedHistory = autoCompactIfNeeded(
      input.conversationHistory.map(m => ({ role: m.role, content: m.content }))
    ).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const compactedInput = { ...input, conversationHistory: compactedHistory }

    // Load context upfront — needed for both routing and execution
    const [memory, activeComponents] = await Promise.all([
      readMemory(this.projectDir),
      this.loadActiveComponents(),
    ])

    // Route intent with full context
    log.debug({ message: input.message }, 'routing intent')
    const route = await classifyIntent(
      input.message,
      compactedInput.conversationHistory,
      activeComponents.map((c) => c.componentId),
      this.config,
      reg
    )
    log.info({ route: route.route, skill: route.skill, summary: route.summary }, 'intent routed')

    // Dispatch based on route
    if (route.route === 'orchestrator') {
      yield* this.runOrchestrator(compactedInput, route, memory, activeComponents, reg, log, abortController)
    } else if (route.route === 'skill' && route.skill) {
      yield* this.runSkill(route.skill, compactedInput, memory, activeComponents, log, abortController)
    } else {
      yield* this.runDirect(compactedInput, memory, log, abortController)
    }
  }

  private async *runOrchestrator(
    input: RunInput,
    route: { summary: string; targetComponentId?: string | null },
    memory: Awaited<ReturnType<typeof readMemory>>,
    activeComponents: Array<{ componentId: string; manifest: unknown }>,
    reg: { languageModel: (id: string) => any },
    log: Logger,
    abortController?: AbortController
  ): AsyncGenerator<unknown> {
    const serverClient = (this.options.serverUrl && this.options.serverApiKey)
      ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
      : null

    const orchCtx: OrchestratorContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      memory,
      activeComponents,
      targetComponentId: input.targetComponentId ?? route.targetComponentId ?? undefined,
      conversationHistory: input.conversationHistory,
      config: this.config,
      registry: reg,
      serverClient,
      sender: this.options.sender,
    }

    const orchestrator = new Orchestrator(orchCtx)
    const t0 = Date.now()
    for await (const part of orchestrator.stream(input.message)) {
      yield part
    }
    this.writeSessionMemory(route.summary, null).catch(() => {})
    log.info({ durationMs: Date.now() - t0 }, 'orchestrator stream finished')
  }

  private async *runSkill(
    skillName: string,
    input: RunInput,
    memory: Awaited<ReturnType<typeof readMemory>>,
    activeComponents: Array<{ componentId: string; manifest: unknown }>,
    log: Logger,
    abortController?: AbortController
  ): AsyncGenerator<unknown> {
    const reg = this.registry as { languageModel: (id: string) => any }
    const serverClient = (this.options.serverUrl && this.options.serverApiKey)
      ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
      : null

    const ctx: AgentContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      memory,
      activeComponents,
      targetComponentId: input.targetComponentId,
      conversationHistory: input.conversationHistory,
    }

    const { aiTools } = buildToolSet({
      projectDir: this.projectDir,
      registry: reg,
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
    log.info({ modelId, skill: skillName }, 'running legacy skill')
    const t0 = Date.now()

    const result = streamText({
      model: reg.languageModel(modelId),
      system: skill.systemPrompt(ctx),
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
      tools: skill.tools,
      stopWhen: stepCountIs(skill.maxSteps ?? 10),
      maxOutputTokens: skill.maxTokens,
      temperature: skill.temperature,
      abortSignal: abortController?.signal,
    })

    for await (const part of result.fullStream) {
      yield part
    }

    Promise.resolve(result.usage).then(usage => {
      log.info({ durationMs: Date.now() - t0, totalTokens: usage?.totalTokens }, 'skill stream finished')
    }).catch(() => {})
  }

  private async *runDirect(
    input: RunInput,
    _memory: Awaited<ReturnType<typeof readMemory>>,
    log: Logger,
    abortController?: AbortController
  ): AsyncGenerator<unknown> {
    const reg = this.registry as { languageModel: (id: string) => any }
    const modelId = mainModelId(this.config)
    log.info({ modelId }, 'running direct response')

    const result = streamText({
      model: reg.languageModel(modelId),
      system: 'You are the CSlate assistant. Answer the user\'s question helpfully and concisely. You do not have access to tools in this mode.',
      messages: [
        ...input.conversationHistory,
        { role: 'user' as const, content: input.message },
      ],
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

  private async writeSessionMemory(summary: string, usage: { totalTokens?: number } | null): Promise<void> {
    const date = new Date().toISOString().slice(0, 16)
    const tokens = usage?.totalTokens ?? 0
    await writeMemoryEntry(
      this.projectDir,
      'componentHistory',
      `[${date}] ${summary} (${tokens} tokens)`
    )
  }
}
