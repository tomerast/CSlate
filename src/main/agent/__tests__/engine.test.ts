import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  generateText: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
  tool: vi.fn((config) => config),
  createProviderRegistry: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
  })),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => ({ chat: vi.fn(() => ({})), languageModel: vi.fn(() => ({})) })) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => vi.fn(() => ({}))) }))

vi.mock('@cslate/shared/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cslate/shared/agent')>()
  return {
    ...actual,
    runAgentStream: vi.fn(),
    runStructuredAgent: vi.fn(),
  }
})

import { runAgentStream, runStructuredAgent } from '@cslate/shared/agent'
import { AgentEngine } from '../engine'

const TEST_PROJECT = join(__dirname, '__engine_test_project__')

beforeEach(() => {
  mkdirSync(join(TEST_PROJECT, 'agent', 'memory'), { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(TEST_PROJECT, { recursive: true, force: true })
})

const mockConfig = { provider: 'anthropic' as const, apiKey: 'test', model: 'claude-sonnet-4-6' }

describe('AgentEngine.stream (v2 — router + orchestrator)', () => {
  it('routes component request to orchestrator', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'orchestrator', summary: 'build a button', skill: null, targetComponentId: null,
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Planning...' }
      yield { type: 'finish', usage: { totalTokens: 100 } }
    })()

    vi.mocked(runAgentStream).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 100 }),
    } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    const parts: unknown[] = []
    for await (const part of engine.stream({ message: 'add a button', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(runStructuredAgent).toHaveBeenCalledOnce() // router
    expect(runAgentStream).toHaveBeenCalledOnce() // orchestrator
  })

  it('routes skill request to legacy skill engine', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'skill', skill: 'state-wirer', summary: 'wire ticker to chart', targetComponentId: null,
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Wiring...' }
      yield { type: 'finish', usage: { totalTokens: 50 } }
    })()

    vi.mocked(runAgentStream).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 50 }),
    } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    const parts: unknown[] = []
    for await (const part of engine.stream({ message: 'wire ticker to chart', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(runStructuredAgent).toHaveBeenCalledOnce()
    expect(runAgentStream).toHaveBeenCalledOnce()
  })

  it('routes direct request without skill tools', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'direct', summary: 'general question', skill: null, targetComponentId: null,
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'CSlate is...' }
      yield { type: 'finish', usage: { totalTokens: 30 } }
    })()

    vi.mocked(runAgentStream).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 30 }),
    } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    const parts: unknown[] = []
    for await (const part of engine.stream({ message: 'what is CSlate?', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(runStructuredAgent).toHaveBeenCalledOnce()
    expect(runAgentStream).toHaveBeenCalledOnce()
    // Direct mode should pass empty tools
    const callArgs = vi.mocked(runAgentStream).mock.calls[0][0]
    expect(callArgs.tools).toEqual({})
  })
})
