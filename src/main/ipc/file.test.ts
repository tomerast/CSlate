import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { readFile, writeFile, fileExists, deleteFile } from './file'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'cslate-test-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('writeFile + readFile', () => {
  it('round-trips file content', async () => {
    await writeFile(projectDir, 'test.txt', 'hello world')
    const content = await readFile(projectDir, 'test.txt')
    expect(content).toBe('hello world')
  })

  it('creates intermediate directories', async () => {
    await writeFile(projectDir, 'components/todo/ui.tsx', 'export default function Todo() {}')
    const content = await readFile(projectDir, 'components/todo/ui.tsx')
    expect(content).toContain('function Todo')
  })

  it('overwrites existing files', async () => {
    await writeFile(projectDir, 'file.txt', 'original')
    await writeFile(projectDir, 'file.txt', 'updated')
    expect(await readFile(projectDir, 'file.txt')).toBe('updated')
  })
})

describe('fileExists', () => {
  it('returns true for existing file', async () => {
    await writeFile(projectDir, 'exists.txt', 'yes')
    expect(await fileExists(projectDir, 'exists.txt')).toBe(true)
  })

  it('returns false for missing file', async () => {
    expect(await fileExists(projectDir, 'missing.txt')).toBe(false)
  })
})

describe('deleteFile', () => {
  it('deletes an existing file', async () => {
    await writeFile(projectDir, 'delete-me.txt', 'bye')
    await deleteFile(projectDir, 'delete-me.txt')
    expect(await fileExists(projectDir, 'delete-me.txt')).toBe(false)
  })

  it('throws if file does not exist', async () => {
    await expect(deleteFile(projectDir, 'no-such-file.txt')).rejects.toThrow()
  })
})

describe('path traversal protection', () => {
  it('readFile blocks ../ traversal', async () => {
    await expect(readFile(projectDir, '../../../etc/passwd')).rejects.toThrow('Path traversal attempt blocked')
  })

  it('writeFile blocks ../ traversal', async () => {
    await expect(writeFile(projectDir, '../../evil.sh', 'rm -rf /')).rejects.toThrow('Path traversal attempt blocked')
  })

  it('deleteFile blocks ../ traversal', async () => {
    await expect(deleteFile(projectDir, '../other-dir/file')).rejects.toThrow('Path traversal attempt blocked')
  })
})

describe('relative projectDir rejection', () => {
  it('readFile rejects a relative projectDir', async () => {
    await expect(readFile('relative/path', 'file.txt')).rejects.toThrow('projectDir must be an absolute path')
  })

  it('writeFile rejects a relative projectDir', async () => {
    await expect(writeFile('relative/path', 'file.txt', 'content')).rejects.toThrow('projectDir must be an absolute path')
  })

  it('fileExists rejects a relative projectDir', async () => {
    await expect(fileExists('relative/path', 'file.txt')).rejects.toThrow('projectDir must be an absolute path')
  })

  it('deleteFile rejects a relative projectDir', async () => {
    await expect(deleteFile('relative/path', 'file.txt')).rejects.toThrow('projectDir must be an absolute path')
  })
})
