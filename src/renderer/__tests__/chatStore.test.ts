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

describe('chatStore session fields', () => {
  beforeEach(() => {
    useChatStore.getState().reset()
  })

  it('starts with null activeSessionId', () => {
    expect(useChatStore.getState().activeSessionId).toBeNull()
  })

  it('starts with empty activeComponentIds', () => {
    expect(useChatStore.getState().activeComponentIds).toEqual([])
  })

  it('setActiveSessionId updates the session id', () => {
    useChatStore.getState().setActiveSessionId('session-123')
    expect(useChatStore.getState().activeSessionId).toBe('session-123')
  })

  it('setActiveComponentIds updates the component ids', () => {
    useChatStore.getState().setActiveComponentIds(['widget_a', 'widget_b'])
    expect(useChatStore.getState().activeComponentIds).toEqual(['widget_a', 'widget_b'])
  })

  it('addActiveComponentId adds without duplicates', () => {
    useChatStore.getState().setActiveComponentIds(['widget_a'])
    useChatStore.getState().addActiveComponentId('widget_a')
    useChatStore.getState().addActiveComponentId('widget_b')
    expect(useChatStore.getState().activeComponentIds).toEqual(['widget_a', 'widget_b'])
  })

  it('reset clears session fields', () => {
    useChatStore.getState().setActiveSessionId('session-123')
    useChatStore.getState().setActiveComponentIds(['widget_a'])
    useChatStore.getState().reset()
    expect(useChatStore.getState().activeSessionId).toBeNull()
    expect(useChatStore.getState().activeComponentIds).toEqual([])
  })
})
