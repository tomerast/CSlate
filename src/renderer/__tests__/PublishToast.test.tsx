import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { PublishToast } from '../chat/PublishToast'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'

beforeEach(() => {
  vi.useFakeTimers()
  useChatStore.getState().reset()
  Object.defineProperty(window, 'electron', {
    value: { invoke: vi.fn().mockResolvedValue({}), on: vi.fn().mockReturnValue(() => {}), send: vi.fn() },
    writable: true, configurable: true,
  })
  // Set a preview manifest so the toast has data to work with
  useCanvasStore.getState().setPreview({
    bundle: 'bundle',
    files: { 'ui.tsx': 'export default () => null' },
    manifest: { name: 'TestComp', description: 'desc', tags: [] },
    placement: undefined,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PublishToast', () => {
  it('renders nothing when publishState is hidden', () => {
    useChatStore.getState().setPublishState('hidden')
    const { container } = render(<PublishToast />)
    expect(container.firstChild).toBeNull()
  })

  it('renders countdown toast with Keep private button when state is countdown', () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    expect(screen.getByText(/Keep private/i)).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('Keep private click cancels countdown and hides toast', () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    fireEvent.click(screen.getByText(/Keep private/i))
    expect(useChatStore.getState().publishState).toBe('hidden')
  })

  it('auto-uploads after 120s and transitions to publishing', async () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    expect(window.electron.invoke).toHaveBeenCalledWith('server:publish', expect.any(Object))
  })

  it('cancels countdown when panel closes', () => {
    useChatStore.getState().setPanelOpen(true)
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    act(() => {
      useChatStore.getState().setPanelOpen(false)
    })
    expect(useChatStore.getState().publishState).toBe('hidden')
  })

  it('does not cancel countdown when panel closes if state is not countdown', () => {
    useChatStore.getState().setPanelOpen(true)
    useChatStore.getState().setPublishState('publishing')
    render(<PublishToast />)
    act(() => {
      useChatStore.getState().setPanelOpen(false)
    })
    expect(useChatStore.getState().publishState).toBe('publishing')
  })

  it('shows Shared! after successful upload', async () => {
    useChatStore.getState().setPublishState('countdown')
    render(<PublishToast />)
    await act(async () => {
      vi.advanceTimersByTime(120_000)
    })
    await act(async () => {
      await Promise.resolve() // flush the invoke promise
    })
    expect(screen.getByText(/Shared!/i)).toBeTruthy()
  })

  it('hides Shared! after 3s', async () => {
    useChatStore.getState().setPublishState('published')
    render(<PublishToast />)
    expect(screen.getByText(/Shared!/i)).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    expect(useChatStore.getState().publishState).toBe('hidden')
  })
})
