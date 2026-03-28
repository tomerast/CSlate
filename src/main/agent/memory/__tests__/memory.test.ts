import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { readMemory, writeMemoryEntry, initMemory } from '../index'
import { buildContextString } from '../context-builder'

const TEST_DIR = join(__dirname, '__test_project__')

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'agent', 'memory'), { recursive: true })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('initMemory', () => {
  it('creates memory directory and MEMORY.md index if missing', async () => {
    const freshDir = join(__dirname, '__fresh_project__')
    try {
      await initMemory(freshDir)
      expect(existsSync(join(freshDir, 'agent', 'memory', 'MEMORY.md'))).toBe(true)
    } finally {
      rmSync(freshDir, { recursive: true, force: true })
    }
  })
})

describe('readMemory', () => {
  it('returns empty strings when memory dir does not exist', async () => {
    const emptyDir = join(__dirname, '__empty__')
    const result = await readMemory(emptyDir)
    expect(result.userPreferences).toBe('')
    expect(result.projectContext).toBe('')
    expect(result.componentHistory).toBe('')
    expect(result.feedbackPatterns).toBe('')
  })

  it('reads existing memory files', async () => {
    writeFileSync(
      join(TEST_DIR, 'agent', 'memory', 'user_preferences.md'),
      '# User Preferences\nPrefers minimal styling.'
    )
    const result = await readMemory(TEST_DIR)
    expect(result.userPreferences).toContain('Prefers minimal styling.')
  })
})

describe('writeMemoryEntry', () => {
  it('appends to component_history.md', async () => {
    await writeMemoryEntry(TEST_DIR, 'componentHistory', 'Built todo-list in 2 iterations.')
    const content = readFileSync(join(TEST_DIR, 'agent', 'memory', 'component_history.md'), 'utf-8')
    expect(content).toContain('Built todo-list in 2 iterations.')
  })

  it('overwrites user_preferences.md when mode is overwrite', async () => {
    await writeMemoryEntry(TEST_DIR, 'userPreferences', 'Prefers dark themes.', 'overwrite')
    const content = readFileSync(join(TEST_DIR, 'agent', 'memory', 'user_preferences.md'), 'utf-8')
    expect(content).toBe('Prefers dark themes.')
  })
})

describe('buildContextString', () => {
  it('returns empty string for empty memory', () => {
    const ctx = buildContextString({ userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' })
    expect(ctx).toBe('')
  })

  it('includes non-empty memory sections', () => {
    const ctx = buildContextString({
      userPreferences: 'Prefers dark themes.',
      projectContext: 'A productivity app.',
      componentHistory: '',
      feedbackPatterns: '',
    })
    expect(ctx).toContain('Prefers dark themes.')
    expect(ctx).toContain('A productivity app.')
    expect(ctx).not.toContain('Component History')
  })

  it('keeps context string under 3200 chars', () => {
    const longText = 'x'.repeat(1000)
    const ctx = buildContextString({
      userPreferences: longText,
      projectContext: longText,
      componentHistory: longText,
      feedbackPatterns: longText,
    })
    expect(ctx.length).toBeLessThan(3200)
  })
})
