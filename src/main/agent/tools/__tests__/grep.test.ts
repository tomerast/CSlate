import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createGrepCSTool } from '../grep'

describe('grep tool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cslate-grep-'))
    await writeFile(join(tmpDir, 'a.ts'), 'export const foo = 1\nexport const bar = 2')
    await mkdir(join(tmpDir, 'sub'), { recursive: true })
    await writeFile(join(tmpDir, 'sub', 'b.tsx'), 'function greet() { return "hello" }')
    await writeFile(join(tmpDir, 'notes.txt'), 'foo bar baz')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('finds pattern across project files', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'foo' })
    const data = result.data as { matches: Array<{ file: string; line: number; content: string }> }
    expect(data.matches.length).toBeGreaterThan(0)
    expect(data.matches.some(m => m.file.includes('a.ts'))).toBe(true)
  })

  it('returns empty matches when pattern not found', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'zzznotfound' })
    const data = result.data as { matches: [] }
    expect(data.matches).toEqual([])
  })

  it('scopes search to a glob pattern', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'foo', glob: '*.ts' })
    const data = result.data as { matches: Array<{ file: string }> }
    expect(data.matches.every(m => m.file.endsWith('.ts'))).toBe(true)
    expect(data.matches.some(m => m.file.includes('notes.txt'))).toBe(false)
  })

  it('returns file, line number, and matching content', async () => {
    const tool = createGrepCSTool(tmpDir)
    const result = await tool.call({ pattern: 'export const foo' })
    const data = result.data as { matches: Array<{ file: string; line: number; content: string }> }
    const match = data.matches[0]
    expect(match).toHaveProperty('file')
    expect(match).toHaveProperty('line')
    expect(match.line).toBe(1)
    expect(match).toHaveProperty('content')
    expect(match.content).toContain('foo')
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createGrepCSTool(tmpDir)
    expect(tool.isReadOnly({ pattern: 'x' })).toBe(true)
    expect(tool.isConcurrencySafe({ pattern: 'x' })).toBe(true)
  })
})
