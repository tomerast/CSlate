// src/main/agent/__tests__/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
  generateObject: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
  tool: vi.fn((config) => config),
  createProviderRegistry: vi.fn(() => ({
    languageModel: vi.fn(() => ({})),
  })),
}))
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({}))) }))
vi.mock('ollama-ai-provider', () => ({ createOllama: vi.fn(() => vi.fn(() => ({}))) }))

import { streamText } from 'ai'
import { Orchestrator } from '../orchestrator/index'
import type { OrchestratorContext } from '../orchestrator/types'

const TEST_DIR = join(__dirname, '__orchestrator_test__')

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'agent', 'memory'), { recursive: true })
  vi.clearAllMocks()
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

function buildTestContext(): OrchestratorContext {
  return {
    projectDir: TEST_DIR,
    tabId: 'test-tab',
    memory: { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' },
    activeComponents: [],
    conversationHistory: [],
    config: { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
    registry: { languageModel: vi.fn().mockReturnValue({}) },
    serverClient: null,
    sender: { send: vi.fn() } as any,
  }
}

describe('Orchestrator', () => {
  it('creates an orchestrator with tools', () => {
    const ctx = buildTestContext()
    const orch = new Orchestrator(ctx)
    expect(orch).toBeDefined()
  })

  it('stream yields parts from the orchestrator agent loop', async () => {
    const mockFullStream = (async function* () {
      yield { type: 'text-delta', textDelta: 'Planning...' }
      yield { type: 'finish', usage: { totalTokens: 200 } }
    })()

    vi.mocked(streamText).mockReturnValue({
      fullStream: mockFullStream,
      usage: Promise.resolve({ totalTokens: 200 }),
    } as any)

    const ctx = buildTestContext()
    const orch = new Orchestrator(ctx)

    const parts: unknown[] = []
    for await (const part of orch.stream('Build a kanban board')) {
      parts.push(part)
    }

    expect(streamText).toHaveBeenCalledOnce()
    expect(parts.some((p: any) => p.type === 'text-delta')).toBe(true)
  })
})
