import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

import { generateObject } from 'ai'
import { classifyIntent, type RouteResult } from '../router'

const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('classifyIntent', () => {
  it('routes component build request to orchestrator', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        route: 'orchestrator',
        summary: 'build a kanban board',
        targetComponentId: null,
      }
    } as any)

    const result = await classifyIntent('Build me a kanban board', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

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

    const result = await classifyIntent('Make the header darker', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

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

    const result = await classifyIntent('Wire the ticker output to the chart', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

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

    const result = await classifyIntent('How do I change my API key?', {
      provider: 'anthropic', apiKey: 'test', model: 'claude-sonnet-4-6'
    }, mockRegistry as any)

    expect(result.route).toBe('direct')
  })
})
