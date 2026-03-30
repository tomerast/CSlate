import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
  tool: vi.fn((config) => config),
  generateText: vi.fn(),
  createProviderRegistry: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
  })),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => vi.fn(() => ({}))) }))

import { generateObject, streamText } from 'ai'
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

describe('AgentEngine.stream', () => {
  it('calls parseIntent then streams with selected skill', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { skill: 'component-builder', summary: 'a button', isMultiTurn: false }
    } as any)

    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Hello' }
      yield { type: 'finish', usage: { totalTokens: 100 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 100 })
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

    expect(generateObject).toHaveBeenCalledOnce()
    expect(streamText).toHaveBeenCalledOnce()
    expect(parts.some((p: any) => p.type === 'text-delta')).toBe(true)
  })

  it('passes memory context into skill system prompt', async () => {
    const { writeMemoryEntry } = await import('../memory/index')
    await writeMemoryEntry(TEST_PROJECT, 'userPreferences', 'Prefers minimal design.')

    vi.mocked(generateObject).mockResolvedValue({
      object: { skill: 'component-builder', summary: 'a card', isMultiTurn: false }
    } as any)
    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () { yield { type: 'finish', usage: {} } })(),
      usage: Promise.resolve({ totalTokens: 0 })
    } as any)

    const engine = new AgentEngine(mockConfig, TEST_PROJECT, {
      serverUrl: 'http://localhost:3000',
      serverApiKey: 'test',
      sender: { send: vi.fn() } as any,
      tabId: 'tab1',
    })

    for await (const _ of engine.stream({ message: 'add a card', conversationHistory: [] })) { /* drain */ }

    const callArgs = vi.mocked(streamText).mock.calls[0][0]
    expect(callArgs.system).toContain('Prefers minimal design.')
  })
})
