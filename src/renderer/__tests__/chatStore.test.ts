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

describe('chatStore messageQueue', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('starts with empty queue', () => {
    expect(useChatStore.getState().messageQueue).toEqual([])
  })

  it('enqueues a message', () => {
    useChatStore.getState().enqueueMessage('hello')
    expect(useChatStore.getState().messageQueue).toEqual(['hello'])
  })

  it('shiftQueue removes and returns first message', () => {
    useChatStore.getState().enqueueMessage('first')
    useChatStore.getState().enqueueMessage('second')
    const next = useChatStore.getState().shiftQueue()
    expect(next).toBe('first')
    expect(useChatStore.getState().messageQueue).toEqual(['second'])
  })

  it('shiftQueue returns undefined when empty', () => {
    const next = useChatStore.getState().shiftQueue()
    expect(next).toBeUndefined()
  })

  it('reset clears the queue', () => {
    useChatStore.getState().enqueueMessage('hello')
    useChatStore.getState().reset()
    expect(useChatStore.getState().messageQueue).toEqual([])
  })
})
