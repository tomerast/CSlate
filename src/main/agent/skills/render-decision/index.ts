import type { WebContents } from 'electron'
import { runAgentStream, mainModelId, type LLMConfig, type AgentRegistry } from '@cslate/shared/agent'
import { classifyRenderType } from './classify'
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
 * Render-decision loop. The router already chose `render`, so we always
 * end up with a card — no plain-chat fallback.
 *   1. Refine the search query via the classifier (or use raw message on failure).
 *   2. Search the server library. On confident hit, emit agent:card and
 *      stream a short intro paragraph.
 *   3. On miss, delegate to the orchestrator which builds the component,
 *      emits its own agent:card, and uploads it for next time.
 */
export async function* runRenderSkill(
  ctx: RenderSkillContext,
): AsyncGenerator<unknown> {
  const log = engineLog.child({ component: 'render-decision', tabId: ctx.tabId })

  // Try to get a refined search query from the classifier. On failure, use the
  // raw user message — the router already validated this should render.
  let searchQuery = ctx.message
  let renderType = 'card'
  try {
    const decision = await classifyRenderType(
      ctx.message,
      ctx.conversationHistory,
      ctx.config,
      ctx.registry,
      ctx.userMemory,
    )
    log.info({ decision }, 'render classification')
    if (decision.shouldRender && decision.searchQuery) {
      searchQuery = decision.searchQuery
      renderType = decision.renderType ?? 'card'
    }
  } catch (err) {
    log.warn({ err }, 'classifyRenderType failed, using raw message as search query')
  }

  const serverClient =
    ctx.serverUrl && ctx.serverApiKey
      ? new CSlateServerClient(ctx.serverUrl, ctx.serverApiKey)
      : null

  const libraryCard = await findLibraryCard(serverClient, searchQuery)

  if (libraryCard) {
    log.info({ componentId: libraryCard.componentId, score: libraryCard.score }, 'library hit')
    ctx.sender.send('agent:card', { card: libraryCard })
    yield* streamIntro(ctx, renderType, searchQuery)
    return
  }

  log.info('no library hit — delegating to orchestrator to generate')
  yield* delegateToOrchestrator(ctx, serverClient)
}

/**
 * Stream a brief 1-sentence intro for a library card. Never asks permission.
 */
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
    abortSignal: ctx.abortSignal,
  }
  const orchestrator = new Orchestrator(orchCtx)
  for await (const part of orchestrator.stream(ctx.message)) {
    yield part
  }
}
