import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

import { generateObject } from 'ai'
import { classifyIntent, type RouteResult } from '../router'

const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('classifyIntent', () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset()
  })

  it('routes component build request to orchestrator', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'orchestrator',
        summary: 'build a kanban board',
        targetComponentId: null,
      }
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
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'orchestrator',
        summary: 'add dark mode to header',
        targetComponentId: 'header',
      }
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
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'skill',
        skill: 'state-wirer',
        summary: 'connect ticker to chart',
        targetComponentId: null,
      }
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
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'direct',
        summary: 'asking about settings',
        targetComponentId: null,
      }
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
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'orchestrator',
        skill: null,
        summary: 'fix stuck loading state in snow_tracker_v2',
        targetComponentId: 'snow_tracker_v2',
      },
    } as any)

    const result = await classifyIntent(
      'it is stuck on scanning slopes',
      [
        { role: 'user', content: 'create a snow tracking app for skiers' },
        { role: 'assistant', content: 'Building snow_tracker_v2...' },
      ],
      ['snow_tracker_v2'],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    expect(result.route).toBe('orchestrator')
    expect(result.targetComponentId).toBe('snow_tracker_v2')
  })

  it('includes active component IDs in the prompt sent to LLM', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'orchestrator', skill: null, summary: 'fix', targetComponentId: 'snow_tracker_v2' },
    } as any)

    await classifyIntent(
      'it is stuck',
      [{ role: 'user', content: 'make a snow tracker' }],
      ['snow_tracker_v2'],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    const call = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(call.prompt).toContain('snow_tracker_v2')
  })

  it('includes recent conversation history in the prompt sent to LLM', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'orchestrator', skill: null, summary: 'fix', targetComponentId: null },
    } as any)

    await classifyIntent(
      'it is stuck',
      [{ role: 'user', content: 'create a snow tracking app for skiers' }],
      ['snow_tracker_v2'],
      { provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6' },
      mockRegistry as any
    )

    const call = vi.mocked(generateObject).mock.calls[0][0] as any
    expect(call.prompt).toContain('create a snow tracking app for skiers')
  })

  it('works with empty history and no active components', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { route: 'direct', skill: null, summary: 'asking about settings', targetComponentId: null },
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
