import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { AppLayout } from '../layout/AppLayout'
import { useChatStore } from '../store/chatStore'
import { useCanvasStore } from '../store/canvasStore'

beforeEach(() => {
  useChatStore.getState().reset()
  useCanvasStore.getState().clearPreview()
  Object.defineProperty(window, 'electron', {
    value: {
      invoke: vi.fn().mockResolvedValue(null),
      on: vi.fn().mockReturnValue(() => {}),
      send: vi.fn(),
      platform: 'darwin',
      isDev: false,
    },
    writable: true, configurable: true,
  })
})

describe('AppLayout chat visibility', () => {
  it('ESC hides the chat UI (chatVisible becomes false)', () => {
    const { queryByTitle } = render(<AppLayout />)
    // Initially the trigger button is visible (no messages, panel closed)
    expect(queryByTitle(/Ask anything/i)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(queryByTitle(/Ask anything/i)).toBeNull()
  })

  it('Cmd+K after ESC restores and opens chat bar', () => {
    const { queryByTitle } = render(<AppLayout />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(queryByTitle(/Ask anything/i)).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(queryByTitle(/Ask anything/i)).toBeTruthy()
  })

  it('ESC also closes an open panel', () => {
    useChatStore.getState().setPanelOpen(true)
    render(<AppLayout />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useChatStore.getState().panelOpen).toBe(false)
  })

  it('Cmd+K toggles cmdBarOpen when already visible', () => {
    // After Cmd+K the FloatingChatBar input should be present
    const { queryByPlaceholderText } = render(<AppLayout />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(queryByPlaceholderText(/Ask anything/i)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(queryByPlaceholderText(/Ask anything/i)).toBeNull()
  })
})
