import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataBus } from '../data-bus'
import type { PipelineOutput } from '../types'

const makeOutput = (data: unknown): PipelineOutput => ({
  data,
  metadata: { fetchedAt: Date.now(), source: 'test', cached: false },
})

describe('DataBus', () => {
  let bus: DataBus

  beforeEach(() => {
    bus = new DataBus()
  })

  it('delivers published data to subscribers', () => {
    const callback = vi.fn()
    bus.subscribe('pipeline_a', callback)

    const output = makeOutput({ value: 42 })
    bus.publish('pipeline_a', output)

    expect(callback).toHaveBeenCalledWith(output)
  })

  it('does not deliver to subscribers of other pipelines', () => {
    const callback = vi.fn()
    bus.subscribe('pipeline_b', callback)

    bus.publish('pipeline_a', makeOutput({ value: 42 }))

    expect(callback).not.toHaveBeenCalled()
  })

  it('stores latest value accessible via getLatest', () => {
    const output = makeOutput({ value: 42 })
    bus.publish('pipeline_a', output)

    expect(bus.getLatest('pipeline_a')).toEqual(output)
  })

  it('returns null for unknown pipeline in getLatest', () => {
    expect(bus.getLatest('nonexistent')).toBeNull()
  })

  it('unsubscribe stops delivery', () => {
    const callback = vi.fn()
    const unsub = bus.subscribe('pipeline_a', callback)

    bus.publish('pipeline_a', makeOutput({ v: 1 }))
    expect(callback).toHaveBeenCalledTimes(1)

    unsub()
    bus.publish('pipeline_a', makeOutput({ v: 2 }))
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('supports multiple subscribers', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    bus.subscribe('pipeline_a', cb1)
    bus.subscribe('pipeline_a', cb2)

    bus.publish('pipeline_a', makeOutput({ v: 1 }))

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('tracks consumers per pipeline', () => {
    const unsub1 = bus.subscribe('pipeline_a', vi.fn())
    bus.subscribe('pipeline_a', vi.fn())

    expect(bus.getConsumerCount('pipeline_a')).toBe(2)

    unsub1()
    expect(bus.getConsumerCount('pipeline_a')).toBe(1)
  })

  it('clear removes all data and subscriptions for a pipeline', () => {
    bus.subscribe('pipeline_a', vi.fn())
    bus.publish('pipeline_a', makeOutput({ v: 1 }))

    bus.clear('pipeline_a')

    expect(bus.getLatest('pipeline_a')).toBeNull()
    expect(bus.getConsumerCount('pipeline_a')).toBe(0)
  })

  it('clearAll removes everything', () => {
    bus.subscribe('a', vi.fn())
    bus.subscribe('b', vi.fn())
    bus.publish('a', makeOutput(1))
    bus.publish('b', makeOutput(2))

    bus.clearAll()

    expect(bus.getLatest('a')).toBeNull()
    expect(bus.getLatest('b')).toBeNull()
  })
})
