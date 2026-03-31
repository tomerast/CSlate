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

import { generateObject, streamText } from 'ai'
import { AgentEngine } from '../engine'

const TEST_PROJECT = join(__dirname, '__integration_test__')

beforeEach(() => {
  mkdirSync(join(TEST_PROJECT, 'agent', 'memory'), { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(TEST_PROJECT, { recursive: true, force: true })
})

describe('Full flow: user request → router → orchestrator → stream', () => {
  it('routes through orchestrator and streams output', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'orchestrator', summary: 'build a todo list', targetComponentId: null }
    } as any)

    const mockStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'I will build a todo list component.' }
      yield { type: 'tool-call', toolName: 'searchBlueprints', input: { query: 'todo list', limit: 5 } }
      yield { type: 'tool-result', toolName: 'searchBlueprints', result: { results: [] } }
      yield { type: 'text-delta', textDelta: ' No blueprint found, building from scratch.' }
      yield { type: 'finish', usage: { totalTokens: 500 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockStream,
      usage: Promise.resolve({ totalTokens: 500 }),
    } as any)

    const sender = { send: vi.fn() }
    const engine = new AgentEngine(
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      TEST_PROJECT,
      { serverUrl: 'http://localhost:3000', serverApiKey: 'test', sender: sender as any, tabId: 'tab1' }
    )

    const parts: any[] = []
    for await (const part of engine.stream({ message: 'Build me a todo list', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(generateObject).toHaveBeenCalledOnce() // router called
    expect(streamText).toHaveBeenCalledOnce() // orchestrator called
    expect(parts.filter(p => p.type === 'text-delta').length).toBeGreaterThan(0)
    // Verify orchestrator status was sent to sender
    expect(sender.send).toHaveBeenCalledWith('agent:orchestrator:status', expect.objectContaining({ phase: 'understand' }))
  })

  it('routes state-wiring to skill path', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'skill', skill: 'state-wirer', summary: 'wire ticker to chart', targetComponentId: null }
    } as any)

    const mockStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Wiring components...' }
      yield { type: 'finish', usage: { totalTokens: 100 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockStream,
      usage: Promise.resolve({ totalTokens: 100 }),
    } as any)

    const engine = new AgentEngine(
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      TEST_PROJECT,
      { serverUrl: '', serverApiKey: '', sender: { send: vi.fn() } as any, tabId: 'tab1' }
    )

    const parts: any[] = []
    for await (const part of engine.stream({ message: 'Wire ticker to chart', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(streamText).toHaveBeenCalledOnce()
    expect(parts.some(p => p.type === 'text-delta')).toBe(true)
  })

  it('handles direct questions without tools', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'direct', summary: 'asking about API key', targetComponentId: null }
    } as any)

    const mockStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Go to Settings to change your API key.' }
      yield { type: 'finish', usage: { totalTokens: 50 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockStream,
      usage: Promise.resolve({ totalTokens: 50 }),
    } as any)

    const engine = new AgentEngine(
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      TEST_PROJECT,
      { serverUrl: '', serverApiKey: '', sender: { send: vi.fn() } as any, tabId: 'tab1' }
    )

    const parts: any[] = []
    for await (const part of engine.stream({ message: 'How do I change my API key?', conversationHistory: [] })) {
      parts.push(part)
    }

    expect(streamText).toHaveBeenCalledOnce()
    // Direct path: streamText called with no tools
    const call = vi.mocked(streamText).mock.calls[0][0]
    expect((call as any).tools).toBeUndefined()
  })
})
