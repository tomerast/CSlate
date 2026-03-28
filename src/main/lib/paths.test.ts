import { describe, it, expect } from 'vitest'
import path from 'path'
import { safePath, safeComponentId } from './paths'

describe('safePath', () => {
  const projectDir = '/home/user/my-app'

  it('resolves a valid relative path', () => {
    const result = safePath(projectDir, 'components/todo/ui.tsx')
    expect(result).toBe('/home/user/my-app/components/todo/ui.tsx')
  })

  it('resolves a file in root of project', () => {
    const result = safePath(projectDir, 'cslate.json')
    expect(result).toBe('/home/user/my-app/cslate.json')
  })

  it('blocks path traversal with ../', () => {
    expect(() => safePath(projectDir, '../../../etc/passwd')).toThrow('Path traversal attempt blocked')
  })

  it('blocks path traversal that starts valid then escapes', () => {
    expect(() => safePath(projectDir, 'components/../../etc/passwd')).toThrow('Path traversal attempt blocked')
  })

  it('allows nested subdirectory paths', () => {
    const result = safePath(projectDir, 'components/stock-ticker/versions/v1/ui.tsx')
    expect(result).toBe('/home/user/my-app/components/stock-ticker/versions/v1/ui.tsx')
  })
})

describe('safeComponentId', () => {
  it('accepts valid lowercase kebab-case ids', () => {
    expect(safeComponentId('stock-ticker')).toBe('stock-ticker')
    expect(safeComponentId('todo-list-v2')).toBe('todo-list-v2')
    expect(safeComponentId('abc')).toBe('abc')
  })

  it('rejects ids with path separators', () => {
    expect(() => safeComponentId('../evil')).toThrow('Invalid componentId')
    expect(() => safeComponentId('components/ticker')).toThrow('Invalid componentId')
  })

  it('rejects ids with spaces or special chars', () => {
    expect(() => safeComponentId('my component')).toThrow('Invalid componentId')
    expect(() => safeComponentId('TICKER')).toThrow('Invalid componentId')
    expect(() => safeComponentId('')).toThrow('Invalid componentId')
  })
})
