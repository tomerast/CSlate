import { describe, it, expect } from 'vitest'
import { createChildAbortController } from '@cslate/shared/agent'

describe('createChildAbortController', () => {
  it('child aborts when parent aborts', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)
    expect(child.signal.aborted).toBe(false)
    parent.abort()
    expect(child.signal.aborted).toBe(true)
  })

  it('child can abort independently', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)
    child.abort()
    expect(child.signal.aborted).toBe(true)
    expect(parent.signal.aborted).toBe(false)
  })

  it('handles already-aborted parent', () => {
    const parent = new AbortController()
    parent.abort()
    const child = createChildAbortController(parent)
    expect(child.signal.aborted).toBe(true)
  })

  it('propagates abort reason', () => {
    const parent = new AbortController()
    const child = createChildAbortController(parent)
    parent.abort('cancelled by user')
    expect(child.signal.reason).toBe('cancelled by user')
  })
})
