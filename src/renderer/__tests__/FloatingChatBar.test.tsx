import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { FloatingChatBar } from '../chat/FloatingChatBar'
import { useChatStore } from '../store/chatStore'

beforeEach(() => {
  useChatStore.getState().reset()
  Object.defineProperty(window, 'electron', {
    value: { invoke: vi.fn(), on: vi.fn().mockReturnValue(() => {}), send: vi.fn(), platform: 'darwin', isDev: false },
    writable: true, configurable: true,
  })
})

const defaultProps = {
  open: false,
  nudgeDismissed: false,
  onSubmit: vi.fn(),
  onDismiss: vi.fn(),
  onOpenPanel: vi.fn(),
  onDismissNudge: vi.fn(),
}

describe('FloatingChatBar', () => {
  it('renders nothing when open=false and no messages', () => {
    const { container } = render(<FloatingChatBar {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders input bar when open=true and no messages', () => {
    render(<FloatingChatBar {...defaultProps} open={true} />)
    expect(screen.getByPlaceholderText('Ask anything (⌘K)')).toBeTruthy()
  })

  it('calls onSubmit with trimmed text on Enter', () => {
    const onSubmit = vi.fn()
    render(<FloatingChatBar {...defaultProps} open={true} onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText('Ask anything (⌘K)')
    fireEvent.change(input, { target: { value: '  hello world  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('hello world')
  })

  it('calls onDismiss on Escape when no messages', () => {
    const onDismiss = vi.fn()
    render(<FloatingChatBar {...defaultProps} open={true} onDismiss={onDismiss} />)
    const input = screen.getByPlaceholderText('Ask anything (⌘K)')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('shows user pill and agent response when messages exist', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'Hello' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'Hi there!' })
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText('Hello')).toBeTruthy()
    expect(screen.getByText(/Hi there!/)).toBeTruthy()
  })

  it('truncates user message to 80 chars', () => {
    const longMsg = 'a'.repeat(100)
    useChatStore.getState().addMessage({ role: 'user', content: longMsg })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'response' })
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText('a'.repeat(80) + '…')).toBeTruthy()
  })

  it('shows density nudge when agent response > 300 chars', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'x'.repeat(301) })
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText(/Conversation getting long/)).toBeTruthy()
  })

  it('shows density nudge when turnCount >= 5', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'short response' })
    for (let i = 0; i < 5; i++) useChatStore.getState().incrementTurnCount()
    render(<FloatingChatBar {...defaultProps} />)
    expect(screen.getByText(/Conversation getting long/)).toBeTruthy()
  })

  it('calls onOpenPanel when "Open full chat" is clicked', () => {
    const onOpenPanel = vi.fn()
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'x'.repeat(301) })
    render(<FloatingChatBar {...defaultProps} onOpenPanel={onOpenPanel} />)
    fireEvent.click(screen.getByText(/Open full chat/))
    expect(onOpenPanel).toHaveBeenCalled()
  })

  it('renders nothing when panelOpen is true', () => {
    useChatStore.getState().addMessage({ role: 'user', content: 'question' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'response' })
    useChatStore.getState().setPanelOpen(true)
    const { container } = render(<FloatingChatBar {...defaultProps} />)
    expect(container.firstChild).toBeNull()
  })
})
