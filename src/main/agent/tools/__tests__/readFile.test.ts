import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createReadFileCSTool } from '../readFile'

describe('readFile tool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cslate-readfile-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('reads a file within projectDir', async () => {
    await writeFile(join(tmpDir, 'hello.ts'), 'export const x = 1')
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'hello.ts' })
    expect(result.data).toEqual({ content: 'export const x = 1' })
  })

  it('rejects path traversal', async () => {
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: '../outside.txt' })
    expect(result.data).toHaveProperty('error')
    expect((result.data as any).error).toMatch(/traversal|invalid/i)
  })

  it('returns error for missing file', async () => {
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'nonexistent.ts' })
    expect(result.data).toHaveProperty('error')
  })

  it('reads partial file with lineRange', async () => {
    await writeFile(join(tmpDir, 'lines.ts'), 'line1\nline2\nline3\nline4\nline5')
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'lines.ts', lineRange: { start: 2, end: 3 } })
    expect(result.data).toEqual({ content: 'line2\nline3' })
  })

  it('reads a file in a subdirectory', async () => {
    await mkdir(join(tmpDir, 'components', 'foo'), { recursive: true })
    await writeFile(join(tmpDir, 'components', 'foo', 'ui.tsx'), 'const x = 42')
    const tool = createReadFileCSTool(tmpDir)
    const result = await tool.call({ path: 'components/foo/ui.tsx' })
    expect(result.data).toEqual({ content: 'const x = 42' })
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createReadFileCSTool(tmpDir)
    expect(tool.isReadOnly({ path: 'any.ts' })).toBe(true)
    expect(tool.isConcurrencySafe({ path: 'any.ts' })).toBe(true)
  })

  it('maxResultSizeChars is 100000', () => {
    const tool = createReadFileCSTool(tmpDir)
    expect(tool.maxResultSizeChars).toBe(100_000)
  })
})
