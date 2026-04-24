import type { CSlateServerClient } from '../../../server/CSlateServerClient'
import type { MessageCard } from '../../../../shared/agentTypes'
import { engineLog } from '../../../lib/logger'

export const RENDER_SCORE_THRESHOLD = 0.82
export const SEARCH_LIMIT = 5

interface SearchHitRaw {
  componentId?: string
  id?: string
  score?: number
  similarity?: number
  relevanceScore?: number
  relevance_score?: number
  manifest?: unknown
}

/**
 * Search the server library for a component that matches the query and,
 * if the best hit is above threshold, fetch its bundle and wrap as a card.
 * Returns null if no confident match exists — caller should fall through
 * to generation.
 */
export async function findLibraryCard(
  serverClient: CSlateServerClient | null,
  searchQuery: string,
): Promise<MessageCard | null> {
  const log = engineLog.child({ component: 'render-decision' })

  if (!serverClient) {
    log.debug('no server client configured')
    return null
  }

  try {
    const response = await serverClient.search(searchQuery, SEARCH_LIMIT)
    const results = (response.results ?? []) as SearchHitRaw[]
    if (results.length === 0) return null

    const scored = results
      .map((r) => ({
        componentId: (r.componentId ?? r.id) as string | undefined,
        score: (r.score ?? r.similarity ?? r.relevanceScore ?? r.relevance_score ?? 0) as number,
        manifest: r.manifest,
      }))
      .filter((r): r is { componentId: string; score: number; manifest: unknown } =>
        typeof r.componentId === 'string',
      )
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
    if (!best || best.score < RENDER_SCORE_THRESHOLD) {
      log.debug({ topScore: best?.score ?? 0, threshold: RENDER_SCORE_THRESHOLD }, 'no confident match')
      return null
    }

    const sourceResp = await serverClient.fetchSource(best.componentId)
    const files = sourceResp.source ?? {}
    const bundle = files['bundle.js']
    if (!bundle || typeof bundle !== 'string') {
      log.warn({ componentId: best.componentId }, 'library hit missing bundle.js')
      return null
    }

    return {
      bundle,
      manifest: sourceResp.manifest ?? best.manifest,
      componentId: best.componentId,
      source: 'server',
      score: best.score,
    }
  } catch (err) {
    log.warn({ err }, 'server search failed')
    return null
  }
}
