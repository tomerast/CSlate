import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '../chatStore'

describe('chatStore orchestrator telemetry', () => {
  beforeEach(() => {
    useChatStore.getState().clear()
  })

  it('records a completed telemetry entry even when the running event was missed', () => {
    useChatStore.getState().updateTelemetry('ui.tsx', {
      modelId: 'anthropic/claude-sonnet-4-6',
      displayModel: 'Claude Sonnet',
      status: 'success',
      durationMs: 1200,
      outputTokens: 240,
      tokPerSec: 200,
      endedAt: Date.now(),
    })

    expect(useChatStore.getState().orchestrator.telemetry).toMatchObject([
      {
        file: 'ui.tsx',
        modelId: 'anthropic/claude-sonnet-4-6',
        displayModel: 'Claude Sonnet',
        status: 'success',
        durationMs: 1200,
        outputTokens: 240,
        tokPerSec: 200,
      },
    ])
  })

  it('updates the most recent running entry for a file', () => {
    const state = useChatStore.getState()
    state.addTelemetry({
      file: 'ui.tsx',
      modelId: 'fast-model',
      displayModel: 'Fast Model',
      status: 'success',
      durationMs: 500,
      outputTokens: 10,
      tokPerSec: 20,
      startedAt: Date.now(),
      endedAt: Date.now(),
    })
    state.addTelemetry({
      file: 'ui.tsx',
      modelId: 'slow-model',
      displayModel: 'Slow Model',
      status: 'running',
      durationMs: 0,
      outputTokens: 0,
      tokPerSec: 0,
      startedAt: Date.now(),
    })

    useChatStore.getState().updateTelemetry('ui.tsx', {
      status: 'timeout',
      durationMs: 25_000,
      endedAt: Date.now(),
    })

    const telemetry = useChatStore.getState().orchestrator.telemetry
    expect(telemetry).toHaveLength(2)
    expect(telemetry[0].status).toBe('success')
    expect(telemetry[1]).toMatchObject({
      file: 'ui.tsx',
      modelId: 'slow-model',
      status: 'timeout',
      durationMs: 25_000,
    })
  })
})
