import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@cslate/shared/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cslate/shared/agent')>()
  return {
    ...actual,
    runStructuredAgent: vi.fn(),
  }
})

import { runStructuredAgent } from '@cslate/shared/agent'
import { classifyIntent, type RouteResult } from '../router'

const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('classifyIntent', () => {
  beforeEach(() => {
    vi.mocked(runStructuredAgent).mockReset()
  })

  it('routes component build request to orchestrator', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'orchestrator',
      summary: 'build a kanban board',
      skill: null,
      targetComponentId: null,
    } as any)

    const result = await classifyIntent(
      'Build me a kanban board',
      [],
      [],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('orchestrator')
    expect(result.summary).toBe('build a kanban board')
  })

  it('routes modification request to orchestrator', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'orchestrator',
      summary: 'add dark mode to header',
      skill: null,
      targetComponentId: 'header',
    } as any)

    const result = await classifyIntent(
      'Make the header darker',
      [],
      [],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('orchestrator')
    expect(result.targetComponentId).toBe('header')
  })

  it('routes state wiring to skill', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'skill',
      skill: 'state-wirer',
      summary: 'connect ticker to chart',
      targetComponentId: null,
    } as any)

    const result = await classifyIntent(
      'Wire the ticker output to the chart',
      [],
      [],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('skill')
    expect(result.skill).toBe('state-wirer')
  })

  it('routes general questions to direct', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'direct',
      summary: 'asking about settings',
      skill: null,
      targetComponentId: null,
    } as any)

    const result = await classifyIntent(
      'How do I change my API key?',
      [],
      [],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('direct')
  })

  it('routes symptom description to orchestrator when active components exist', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'orchestrator',
      skill: null,
      summary: 'fix stuck loading state in snow_tracker_v2',
      targetComponentId: 'snow_tracker_v2',
    } as any)

    const result = await classifyIntent(
      'it is stuck on scanning slopes',
      [
        { role: 'user', content: 'create a snow tracking app for skiers' },
        { role: 'assistant', content: 'Building snow_tracker_v2...' },
      ],
      [{ componentId: 'snow_tracker_v2', name: 'Snow Tracker v2', description: 'A snow tracking app for skiers' }],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('orchestrator')
    expect(result.targetComponentId).toBe('snow_tracker_v2')
  })

  it('includes active component IDs in the prompt sent to LLM', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'orchestrator', skill: null, summary: 'fix', targetComponentId: 'snow_tracker_v2',
    } as any)

    await classifyIntent(
      'it is stuck',
      [{ role: 'user', content: 'make a snow tracker' }],
      [{ componentId: 'snow_tracker_v2', name: 'Snow Tracker v2', description: 'A snow tracking app for skiers' }],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    const call = vi.mocked(runStructuredAgent).mock.calls[0][0] as any
    expect(call.prompt).toContain('snow_tracker_v2')
  })

  it('includes recent conversation history in the prompt sent to LLM', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'orchestrator', skill: null, summary: 'fix', targetComponentId: null,
    } as any)

    await classifyIntent(
      'it is stuck',
      [{ role: 'user', content: 'create a snow tracking app for skiers' }],
      [{ componentId: 'snow_tracker_v2', name: 'Snow Tracker v2', description: 'A snow tracking app for skiers' }],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    const call = vi.mocked(runStructuredAgent).mock.calls[0][0] as any
    expect(call.prompt).toContain('create a snow tracking app for skiers')
  })

  it('works with empty history and no active components', async () => {
    vi.mocked(runStructuredAgent).mockResolvedValue({
      route: 'direct', skill: null, summary: 'asking about settings', targetComponentId: null,
    } as any)

    const result = await classifyIntent(
      'How do I change my API key?',
      [],
      [],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('direct')
  })
})
