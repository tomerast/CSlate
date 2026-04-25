import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@cslate/shared/agent', () => ({
  runAgentStream: vi.fn(() => ({
    fullStream: (async function* () {
      yield { type: 'text-delta', text: 'hello' }
      yield { type: 'finish', response: { usage: {} } }
    })(),
  })),
  fastModelId: () => 'fast',
  mainModelId: () => 'main',
}))

vi.mock('../../../lib/structuredAgent', () => ({
  runStructuredAgentSafe: vi.fn(),
}))

vi.mock('../../../orchestrator/index', () => ({
  Orchestrator: class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_ctx: unknown) {}
    async *stream(_msg: string): AsyncGenerator<unknown> {
      yield { type: 'text-delta', text: 'orchestrator-output' }
      yield { type: 'finish', response: { usage: {} } }
    }
  },
}))

import { runStructuredAgentSafe } from '../../../lib/structuredAgent'
import { runRenderSkill } from '../index'
import { CSlateServerClient } from '../../../../server/CSlateServerClient'

function makeSender() {
  const sent: Array<{ channel: string; payload: unknown }> = []
  const sender = { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) }
  return { sender: sender as unknown as Electron.WebContents, sent }
}

function makeCtx(overrides: Partial<Parameters<typeof runRenderSkill>[0]> = {}) {
  const { sender } = makeSender()
  return {
    message: 'show me tesla this week',
    conversationHistory: [],
    userMemory: '',
    projectDir: '/tmp/cslate-test',
    tabId: 'tab-1',
    config: { provider: 'anthropic' as const, apiKey: 'x', model: 'claude' },
    registry: { languageModel: () => ({}) } as unknown as Parameters<typeof runRenderSkill>[0]['registry'],
    serverUrl: 'http://localhost:3000',
    serverApiKey: 'key',
    sender,
    ...overrides,
  }
}

async function drain(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const part of gen) out.push(part)
  return out
}

describe('runRenderSkill', () => {
  beforeEach(() => {
    vi.mocked(runStructuredAgentSafe).mockReset()
  })

  it('uses the raw message and delegates when classifier says shouldRender=false', async () => {
    vi.mocked(runStructuredAgentSafe).mockResolvedValueOnce({
      shouldRender: false,
      renderType: null,
      searchQuery: null,
      reasoning: 'small talk',
    })

    const { sender, sent } = makeSender()
    const parts = await drain(runRenderSkill(makeCtx({ sender })))

    const deltas = parts.filter(
      (p): p is { type: 'text-delta'; text: string } =>
        (p as { type?: string }).type === 'text-delta',
    )
    expect(deltas.some((d) => d.text === 'orchestrator-output')).toBe(true)
    expect(sent.find((e) => e.channel === 'agent:card')).toBeUndefined()
  })

  it('emits agent:card when the library returns a confident hit', async () => {
    vi.mocked(runStructuredAgentSafe).mockResolvedValueOnce({
      shouldRender: true,
      renderType: 'price-chart',
      searchQuery: 'tesla stock price chart',
      reasoning: 'price question',
    })

    const searchSpy = vi
      .spyOn(CSlateServerClient.prototype, 'search')
      .mockResolvedValue({
        results: [
          {
            componentId: 'tesla_stock_chart',
            score: 0.91,
            manifest: { name: 'tesla_stock_chart' },
          },
        ],
        total: 1,
      })
    const fetchSpy = vi.spyOn(CSlateServerClient.prototype, 'fetchSource').mockResolvedValue({
      source: { 'bundle.js': 'module.exports.default = () => null' },
      manifest: { name: 'tesla_stock_chart' },
    })

    const { sender, sent } = makeSender()
    await drain(runRenderSkill(makeCtx({ sender })))

    expect(searchSpy).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith('tesla_stock_chart')
    const cardEvent = sent.find((e) => e.channel === 'agent:card')
    expect(cardEvent).toBeDefined()
    const payload = cardEvent?.payload as { card: { source: string; componentId?: string } }
    expect(payload.card.source).toBe('server')
    expect(payload.card.componentId).toBe('tesla_stock_chart')

    searchSpy.mockRestore()
    fetchSpy.mockRestore()
  })

  it('uses server relevance_score fields when scoring library hits', async () => {
    vi.mocked(runStructuredAgentSafe).mockResolvedValueOnce({
      shouldRender: true,
      renderType: 'price-chart',
      searchQuery: 'tesla stock price chart',
      reasoning: 'price question',
    })

    const searchSpy = vi
      .spyOn(CSlateServerClient.prototype, 'search')
      .mockResolvedValue({
        results: [
          {
            id: 'tesla_stock_chart',
            relevance_score: 0.91,
            manifest: { name: 'tesla_stock_chart' },
          },
        ],
        total: 1,
      })
    const fetchSpy = vi.spyOn(CSlateServerClient.prototype, 'fetchSource').mockResolvedValue({
      source: { 'bundle.js': 'module.exports.default = () => null' },
      manifest: { name: 'tesla_stock_chart' },
    })

    const { sender, sent } = makeSender()
    await drain(runRenderSkill(makeCtx({ sender })))

    expect(searchSpy).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith('tesla_stock_chart')
    expect(sent.find((e) => e.channel === 'agent:card')).toBeDefined()

    searchSpy.mockRestore()
    fetchSpy.mockRestore()
  })

  it('delegates to the orchestrator when no confident library hit exists', async () => {
    vi.mocked(runStructuredAgentSafe).mockResolvedValueOnce({
      shouldRender: true,
      renderType: 'dashboard',
      searchQuery: 'niche dashboard nobody has built',
      reasoning: 'novel',
    })

    const searchSpy = vi
      .spyOn(CSlateServerClient.prototype, 'search')
      .mockResolvedValue({
        results: [{ componentId: 'low_match', score: 0.3 }],
        total: 1,
      })

    const { sender, sent } = makeSender()
    const parts = await drain(runRenderSkill(makeCtx({ sender })))

    const deltas = parts.filter(
      (p): p is { type: 'text-delta'; text: string } =>
        (p as { type?: string }).type === 'text-delta',
    )
    expect(deltas.some((d) => d.text === 'orchestrator-output')).toBe(true)
    expect(sent.find((e) => e.channel === 'agent:card')).toBeUndefined()

    searchSpy.mockRestore()
  })
})
