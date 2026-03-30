import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useChat } from '../chat/useChat'
import { useChatStore } from '../store/chatStore'

describe('useChat', () => {
  let mockInvoke: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset the chat store before each test
    useChatStore.getState().reset()

    // Mock window.electron
    mockInvoke = vi.fn().mockResolvedValue({ ok: true })
    Object.defineProperty(window, 'electron', {
      value: {
        invoke: mockInvoke,
        platform: 'darwin',
        isDev: false,
        send: vi.fn(),
        on: vi.fn().mockReturnValue(() => {})
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('double-message regression test', () => {
    it('should NOT include the new user message in conversationHistory', async () => {
      // Pre-populate the chat store with existing messages
      const { addMessage } = useChatStore.getState()
      addMessage({ role: 'user', content: 'First message' })
      addMessage({ role: 'assistant', content: 'First response' })
      addMessage({ role: 'user', content: 'Second message' })
      addMessage({ role: 'assistant', content: 'Second response' })

      // Render the hook and submit a new message
      const { result } = renderHook(() => useChat())
      await result.current.submit('Third message')

      // Wait for the async operation to complete
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled()
      })

      // Verify the IPC call
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(mockInvoke).toHaveBeenCalledWith('agent:run', expect.objectContaining({
        message: 'Third message',
        conversationHistory: expect.any(Array)
      }))

      // Extract the conversationHistory from the call
      const callArgs = mockInvoke.mock.calls[0][1]
      const conversationHistory = callArgs.conversationHistory

      // REGRESSION TEST: The new user message should NOT be in the history
      // The history should only contain the 4 pre-existing messages
      expect(conversationHistory).toHaveLength(4)
      expect(conversationHistory).toEqual([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
        { role: 'assistant', content: 'Second response' }
      ])

      // Verify the new message is NOT in the history sent to the agent
      const userMessages = conversationHistory.filter((m: { role: string }) => m.role === 'user')
      expect(userMessages).not.toContainEqual(
        expect.objectContaining({ content: 'Third message' })
      )
    })

    it('should add the user message to the store after capturing history', async () => {
      // Start with an empty store
      const { result } = renderHook(() => useChat())

      // Submit a message
      await result.current.submit('Test message')

      // Wait for the async operation
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled()
      })

      // Verify the message was added to the store
      const messages = useChatStore.getState().messages
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        role: 'user',
        content: 'Test message'
      })

      // But the conversationHistory sent to the agent should be empty
      const callArgs = mockInvoke.mock.calls[0][1]
      expect(callArgs.conversationHistory).toEqual([])
    })

    it('should respect MAX_HISTORY_MESSAGES limit (6 messages)', async () => {
      // Pre-populate with 10 messages (5 exchanges)
      const { addMessage } = useChatStore.getState()
      for (let i = 1; i <= 5; i++) {
        addMessage({ role: 'user', content: `User message ${i}` })
        addMessage({ role: 'assistant', content: `Assistant response ${i}` })
      }

      // Submit a new message
      const { result } = renderHook(() => useChat())
      await result.current.submit('New message')

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled()
      })

      // Verify only the last 6 messages are included in history
      const callArgs = mockInvoke.mock.calls[0][1]
      const conversationHistory = callArgs.conversationHistory

      expect(conversationHistory).toHaveLength(6)
      expect(conversationHistory[0]).toEqual({ role: 'user', content: 'User message 3' })
      expect(conversationHistory[5]).toEqual({ role: 'assistant', content: 'Assistant response 5' })
    })
  })

  describe('basic submit functionality', () => {
    it('should call agent:run with correct parameters', async () => {
      const { result } = renderHook(() => useChat())
      await result.current.submit('Hello')

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled()
      })

      expect(mockInvoke).toHaveBeenCalledWith('agent:run', {
        message: 'Hello',
        projectDir: '',
        tabId: expect.any(String),
        conversationHistory: []
      })
    })

    it('should set status to generating then idle', async () => {
      const { result } = renderHook(() => useChat())

      expect(useChatStore.getState().status).toBe('idle')

      const submitPromise = result.current.submit('Test')

      // Status should be generating immediately after submit
      expect(useChatStore.getState().status).toBe('generating')

      await submitPromise

      await waitFor(() => {
        expect(useChatStore.getState().status).toBe('idle')
      })
    })

    it('should set panelOpen to true on submit', async () => {
      const { result } = renderHook(() => useChat())

      expect(useChatStore.getState().panelOpen).toBe(false)

      await result.current.submit('Test')

      expect(useChatStore.getState().panelOpen).toBe(true)
    })

    it('should handle errors and add error message', async () => {
      // Mock a failure
      mockInvoke.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useChat())
      await result.current.submit('Test')

      await waitFor(() => {
        expect(useChatStore.getState().status).toBe('error')
      })

      const messages = useChatStore.getState().messages
      expect(messages).toHaveLength(2) // user message + error message
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        content: 'Failed: Network error'
      })
    })
  })
})
