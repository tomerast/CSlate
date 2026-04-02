import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createLspCSTool } from '../lsp'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))
import { spawn } from 'child_process'
const mockSpawn = vi.mocked(spawn)

function makeChildProcess(stdout: string, exitCode: number = 0) {
  const EventEmitter = require('events')
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()

  setTimeout(() => {
    child.stdout.emit('data', Buffer.from(stdout))
    child.emit('close', exitCode)
  }, 0)
  return child
}

describe('lsp tool', () => {
  const projectDir = '/tmp/fake-project'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty diagnostics when tsc exits 0', async () => {
    mockSpawn.mockReturnValue(makeChildProcess('', 0) as any)
    const tool = createLspCSTool(projectDir)
    const result = await tool.call({})
    expect(result.data).toEqual({ diagnostics: [] })
  })

  it('parses tsc error output into structured diagnostics', async () => {
    const tscOutput = `src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar.ts(3,1): warning TS7006: Parameter 'x' implicitly has an 'any' type.`
    mockSpawn.mockReturnValue(makeChildProcess(tscOutput, 1) as any)

    const tool = createLspCSTool(projectDir)
    const result = await tool.call({})
    const data = result.data as { diagnostics: any[] }

    expect(data.diagnostics).toHaveLength(2)
    expect(data.diagnostics[0]).toEqual({
      file: 'src/foo.ts',
      line: 10,
      col: 5,
      message: "TS2322: Type 'string' is not assignable to type 'number'.",
      severity: 'error',
    })
    expect(data.diagnostics[1].severity).toBe('warning')
  })

  it('scopes diagnostics to specific files when provided', async () => {
    const tscOutput = `src/foo.ts(10,5): error TS2322: some error.
src/bar.ts(3,1): error TS7006: other error.`
    mockSpawn.mockReturnValue(makeChildProcess(tscOutput, 1) as any)

    const tool = createLspCSTool(projectDir)
    const result = await tool.call({ files: ['src/foo.ts'] })
    const data = result.data as { diagnostics: any[] }

    expect(data.diagnostics).toHaveLength(1)
    expect(data.diagnostics[0].file).toBe('src/foo.ts')
  })

  it('is read-only but NOT concurrency-safe', () => {
    const tool = createLspCSTool(projectDir)
    expect(tool.isReadOnly({})).toBe(true)
    expect(tool.isConcurrencySafe({})).toBe(false)
  })
})
