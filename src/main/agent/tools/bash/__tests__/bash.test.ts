import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBashCSTool } from '../../bash'
import type { PermissionBroker } from '../permissions'

vi.mock('../executor', () => ({
  execute: vi.fn(),
}))
import { execute } from '../executor'
const mockExecute = vi.mocked(execute)

describe('bash tool', () => {
  const projectDir = '/tmp/test-project'
  const allowBroker: PermissionBroker = { request: async () => true }
  const denyBroker: PermissionBroker = { request: async () => false }

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 })
  })

  it('runs an allowed command without consulting broker', async () => {
    const tool = createBashCSTool(projectDir, denyBroker)
    const result = await tool.call({ command: 'tsc --noEmit' })
    const data = result.data as { stdout: string; stderr: string; exitCode: number }
    expect(data.stdout).toBe('ok')
  })

  it('consults broker for prompt-category commands', async () => {
    const brokerSpy = vi.fn().mockResolvedValue(true)
    const broker: PermissionBroker = { request: brokerSpy }
    const tool = createBashCSTool(projectDir, broker)
    await tool.call({ command: 'rm dist/index.js' })
    expect(brokerSpy).toHaveBeenCalledWith('rm dist/index.js')
    expect(mockExecute).toHaveBeenCalled()
  })

  it('does not execute when broker denies', async () => {
    const tool = createBashCSTool(projectDir, denyBroker)
    const result = await tool.call({ command: 'rm dist/index.js' })
    const data = result.data as { error: string }
    expect(data).toHaveProperty('error')
    expect(data.error).toMatch(/denied/i)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('auto-denies dangerous commands without consulting broker', async () => {
    const brokerSpy = vi.fn()
    const tool = createBashCSTool(projectDir, { request: brokerSpy })
    const result = await tool.call({ command: 'eval "rm -rf /"' })
    const data = result.data as { error: string }
    expect(data).toHaveProperty('error')
    expect(brokerSpy).not.toHaveBeenCalled()
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('passes projectDir as default cwd to executor', async () => {
    const tool = createBashCSTool(projectDir, allowBroker)
    await tool.call({ command: 'tsc --noEmit' })
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: projectDir })
    )
  })

  it('is NOT read-only and NOT concurrency-safe', () => {
    const tool = createBashCSTool(projectDir, allowBroker)
    expect(tool.isReadOnly({ command: 'echo hi' })).toBe(false)
    expect(tool.isConcurrencySafe({ command: 'echo hi' })).toBe(false)
  })
})
