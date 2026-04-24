import type { WebContents } from 'electron'
import { runAgentStream, mainModelId, type LLMConfig, type AgentRegistry } from '@cslate/shared/agent'
import { classifyRenderType, type RenderDecision } from './classify'
import { findLibraryCard } from './search-server'
import { directReplySystem } from './prompts'
import { Orchestrator } from '../../orchestrator/index'
import type { OrchestratorContext } from '../../orchestrator/types'
import { CSlateServerClient } from '../../../server/CSlateServerClient'
import { engineLog } from '../../../lib/logger'

export interface RenderSkillContext {
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  userMemory: string
  projectDir: string
  tabId: string
  config: LLMConfig
  registry: AgentRegistry
  serverUrl: string
  serverApiKey: string
  sender: WebContents
  abortSignal?: AbortSignal
}

/**
 * Render-decision loop:
 *   1. Ask a fast model whether a live card would help.
 *   2. If yes, search the server library. On confident hit, emit agent:card
 *      and stream a short intro paragraph.
 *   3. On miss, delegate to the orchestrator which builds the component,
 *      emits its own agent:card, and uploads for next time.
 *   4. If the classifier says no, fall back to a plain chat reply.
 */
export async function* runRenderSkill(
  ctx: RenderSkillContext,
): AsyncGenerator<unknown> {
  const log = engineLog.child({ component: 'render-decision', tabId: ctx.tabId })

  const decision: RenderDecision = await classifyRenderType(
    ctx.message,
    ctx.conversationHistory,
    ctx.config,
    ctx.registry,
    ctx.userMemory,
  )
  log.info({ decision }, 'render classification')

  if (!decision.shouldRender || !decision.searchQuery || !decision.renderType) {
    yield* plainChat(ctx)
    return
  }

  const serverClient =
    ctx.serverUrl && ctx.serverApiKey
      ? new CSlateServerClient(ctx.serverUrl, ctx.serverApiKey)
      : null

  const libraryCard = await findLibraryCard(serverClient, decision.searchQuery)

  if (libraryCard) {
    log.info({ componentId: libraryCard.componentId, score: libraryCard.score }, 'library hit')
    ctx.sender.send('agent:card', { card: libraryCard })
    yield* streamIntro(ctx, decision.renderType, decision.searchQuery)
    return
  }

  log.info('no library hit — delegating to orchestrator to generate')
  yield* delegateToOrchestrator(ctx, serverClient)
}

async function* plainChat(ctx: RenderSkillContext): AsyncGenerator<unknown> {
  const userMemory = ctx.userMemory
  const base =
    "You are the CSlate assistant. Answer the user's question helpfully and concisely."
  const system = userMemory.trim()
    ? `${base}\n\nUser preferences (adapt accordingly):\n${userMemory.trim()}`
    : base

  const result = runAgentStream({
    modelId: mainModelId(ctx.config),
    registry: ctx.registry,
    system,
    messages: [
      ...ctx.conversationHistory,
      { role: 'user' as const, content: ctx.message },
    ],
    tools: {},
    maxOutputTokens: 1000,
    abortSignal: ctx.abortSignal,
  })

  for await (const part of result.fullStream) {
    yield part
  }
}

async function* streamIntro(
  ctx: RenderSkillContext,
  renderType: string,
  searchQuery: string,
): AsyncGenerator<unknown> {
  const result = runAgentStream({
    modelId: mainModelId(ctx.config),
    registry: ctx.registry,
    system: directReplySystem(renderType, searchQuery, ctx.userMemory),
    messages: [
      ...ctx.conversationHistory,
      { role: 'user' as const, content: ctx.message },
    ],
    tools: {},
    maxOutputTokens: 300,
    abortSignal: ctx.abortSignal,
  })

  for await (const part of result.fullStream) {
    yield part
  }
}

async function* delegateToOrchestrator(
  ctx: RenderSkillContext,
  serverClient: CSlateServerClient | null,
): AsyncGenerator<unknown> {
  const orchCtx: OrchestratorContext = {
    projectDir: ctx.projectDir,
    tabId: ctx.tabId,
    userMemory: ctx.userMemory,
    activeComponents: [],
    targetComponentId: undefined,
    conversationHistory: ctx.conversationHistory,
    config: ctx.config,
    registry: ctx.registry,
    serverClient,
    sender: ctx.sender,
  }
  const orchestrator = new Orchestrator(orchCtx)
  for await (const part of orchestrator.stream(ctx.message)) {
    yield part
  }
}
