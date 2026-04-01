import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildTool } from '../types'

describe('buildTool', () => {
  const minimalTool = buildTool({
    name: 'testTool',
    description: 'A test tool',
    inputSchema: z.object({ value: z.string() }),
    call: async (input) => ({ data: input.value }),
  })

  it('provides safe defaults', () => {
    expect(minimalTool.name).toBe('testTool')
    expect(minimalTool.isReadOnly({ value: 'x' })).toBe(false)
    expect(minimalTool.isConcurrencySafe({ value: 'x' })).toBe(false)
    expect(minimalTool.maxResultSizeChars).toBe(50_000)
  })

  it('allows overriding defaults', () => {
    const readOnlyTool = buildTool({
      name: 'readOnly',
      description: 'Reads stuff',
      inputSchema: z.object({ id: z.string() }),
      call: async () => ({ data: 'ok' }),
      isReadOnly: () => true,
      isConcurrencySafe: () => true,
      maxResultSizeChars: 100_000,
    })
    expect(readOnlyTool.isReadOnly({ id: '1' })).toBe(true)
    expect(readOnlyTool.isConcurrencySafe({ id: '1' })).toBe(true)
    expect(readOnlyTool.maxResultSizeChars).toBe(100_000)
  })

  it('validates input with validateInput when provided', async () => {
    const validatedTool = buildTool({
      name: 'validated',
      description: 'Validates input',
      inputSchema: z.object({ id: z.string() }),
      call: async () => ({ data: 'ok' }),
      validateInput: async (input) => {
        if (input.id === '') return { valid: false, message: 'ID required' }
        return { valid: true }
      },
    })
    expect(await validatedTool.validateInput!({ id: '' })).toEqual({ valid: false, message: 'ID required' })
    expect(await validatedTool.validateInput!({ id: 'abc' })).toEqual({ valid: true })
  })

  it('toAISDKTool converts to AI SDK format', () => {
    const aiTool = minimalTool.toAISDKTool()
    expect(aiTool.description).toBe('A test tool')
    expect(typeof aiTool.execute).toBe('function')
  })

  it('toAISDKTool runs validateInput before call', async () => {
    const tool = buildTool({
      name: 'validated',
      description: 'test',
      inputSchema: z.object({ id: z.string() }),
      call: async () => ({ data: 'should not reach' }),
      validateInput: async () => ({ valid: false, message: 'blocked' }),
    })
    const aiTool = tool.toAISDKTool()
    await expect(
      aiTool.execute!({ id: 'test' }, { toolCallId: 'x', messages: [], abortSignal: new AbortController().signal })
    ).rejects.toThrow('blocked')
  })
})
