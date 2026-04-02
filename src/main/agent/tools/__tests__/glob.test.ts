import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createGlobCSTool } from '../glob'

describe('glob tool', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cslate-glob-'))
    await mkdir(join(tmpDir, 'components', 'button'), { recursive: true })
    await mkdir(join(tmpDir, 'components', 'card'), { recursive: true })
    await writeFile(join(tmpDir, 'components', 'button', 'ui.tsx'), '')
    await writeFile(join(tmpDir, 'components', 'button', 'logic.ts'), '')
    await writeFile(join(tmpDir, 'components', 'card', 'ui.tsx'), '')
    await writeFile(join(tmpDir, 'README.md'), '')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('finds all tsx files', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: '**/*.tsx' })
    const data = result.data as { files: string[] }
    expect(data.files).toHaveLength(2)
    expect(data.files.every((f: string) => f.endsWith('.tsx'))).toBe(true)
  })

  it('finds all files in a specific dir', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: 'components/button/*' })
    const data = result.data as { files: string[] }
    expect(data.files).toHaveLength(2)
    expect(data.files.every((f: string) => f.startsWith('components/button/'))).toBe(true)
  })

  it('returns empty array when no matches', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: '**/*.py' })
    const data = result.data as { files: string[] }
    expect(data.files).toEqual([])
  })

  it('returns paths relative to projectDir', async () => {
    const tool = createGlobCSTool(tmpDir)
    const result = await tool.call({ pattern: '**/*.ts' })
    const data = result.data as { files: string[] }
    expect(data.files.every((f: string) => !f.startsWith('/'))).toBe(true)
  })

  it('is read-only and concurrency-safe', () => {
    const tool = createGlobCSTool(tmpDir)
    expect(tool.isReadOnly({ pattern: '**' })).toBe(true)
    expect(tool.isConcurrencySafe({ pattern: '**' })).toBe(true)
  })
})
