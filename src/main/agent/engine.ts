import { streamText, stepCountIs } from 'ai'
import type { WebContents } from 'electron'
import { buildRegistry, mainModelId, fastModelId, type LLMConfig } from './providers'
import { parseIntent } from './intent'
import { readMemory, writeMemoryEntry } from './memory/index'
import { buildSkillRegistry, type AgentContext } from './skills/index'
import { validateManifest } from './tools/validateManifest'
import { createReviewCodeTool } from './tools/reviewCode'
import { createRenderComponentTool } from './tools/renderComponent'
import { createWriteComponentTool } from './tools/writeComponent'
import { createReadManifestTool } from './tools/readManifest'
import { createReadProjectContextTool } from './tools/readProjectContext'
import { createSearchBlueprintsTool } from './tools/searchBlueprints'
import { CSlateServerClient } from '../server/CSlateServerClient'
import { engineLog } from '../lib/logger'

export interface EngineOptions {
  serverUrl: string
  serverApiKey: string
  sender: WebContents
  tabId: string
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

    // 1. Parse intent
    log.debug({ message: input.message }, 'parsing intent')
    const intent = await parseIntent(input.message, this.config, this.registry)
    log.info({ skill: intent.skill, targetComponentId: intent.targetComponentId, summary: intent.summary }, 'intent parsed')

    // 2. Load context
    const memory = await readMemory(this.projectDir)
    const activeComponents = await this.loadActiveComponents()
    log.debug({ activeComponentCount: activeComponents.length }, 'context loaded')

    const ctx: AgentContext = {
      projectDir: this.projectDir,
      tabId: this.options.tabId,
      memory,
      activeComponents,
      targetComponentId: input.targetComponentId ?? intent.targetComponentId ?? undefined,
      conversationHistory: input.conversationHistory,
    }

    // 3. Build tools
    // Cast registry to a looser type for dynamic model ID support
    const reg = this.registry as { languageModel: (id: string) => any }
    const serverClient = (this.options.serverUrl && this.options.serverApiKey)
      ? new CSlateServerClient(this.options.serverUrl, this.options.serverApiKey)
      : null
    const tools = {
      validateManifest,
      reviewCode: createReviewCodeTool(reg, fastModelId(this.config)),
      renderComponent: createRenderComponentTool(),
      writeComponent: createWriteComponentTool(this.projectDir),
      readManifest: createReadManifestTool(this.projectDir),
      readProjectContext: createReadProjectContextTool(this.projectDir),
      searchBlueprints: createSearchBlueprintsTool(serverClient),
    }

    // 4. Select skill
    const skillRegistry = buildSkillRegistry(tools)
    const skill = skillRegistry[intent.skill]

    // 5. Stream
    const modelId = mainModelId(this.config)
    log.info({ modelId, skill: intent.skill, maxSteps: skill.maxSteps }, 'streamText starting')
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
    })

    let partCount = 0
    for await (const part of result.fullStream) {
      if (partCount === 0) log.debug({ durationMs: Date.now() - t0 }, 'first token received')
      partCount++
      yield part
    }

    // 6. Fire-and-forget memory write
    Promise.resolve(result.usage).then(usage => {
      log.info({ durationMs: Date.now() - t0, totalTokens: usage?.totalTokens, partCount }, 'stream finished')
      this.writeSessionMemory(intent.summary, usage).catch(() => {/* non-critical */})
    }).catch(() => {/* non-critical */})
  }

  private async loadActiveComponents(): Promise<Array<{ componentId: string; manifest: unknown }>> {
    const tool = createReadProjectContextTool(this.projectDir)
    try {
      const ctx = await tool.execute!({ includeSourceSummaries: false }, {} as any)
      return (ctx as any).components ?? []
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
