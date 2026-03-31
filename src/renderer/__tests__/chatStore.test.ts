import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '../store/chatStore'

describe('chatStore turnCount', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('starts at 0', () => {
    expect(useChatStore.getState().turnCount).toBe(0)
  })

  it('increments by 1 on each call', () => {
    useChatStore.getState().incrementTurnCount()
    expect(useChatStore.getState().turnCount).toBe(1)
    useChatStore.getState().incrementTurnCount()
    expect(useChatStore.getState().turnCount).toBe(2)
  })

  it('resets to 0 on reset()', () => {
    useChatStore.getState().incrementTurnCount()
    useChatStore.getState().incrementTurnCount()
    useChatStore.getState().reset()
    expect(useChatStore.getState().turnCount).toBe(0)
  })
})
