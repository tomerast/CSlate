import { describe, it, expect } from 'vitest'
import { buildToolSet } from '../index'

const fakeDeps = {
  projectDir: '/tmp/test',
  registry: { languageModel: (_id: string) => ({}) },
  fastModelId: 'fast',
  serverClient: null,
  permissionBroker: { request: async (_cmd: string) => true },
}

describe('buildToolSet', () => {
  it('build tier includes readFile, grep, glob, webFetch but NOT bash or lsp', () => {
    const { csTools } = buildToolSet(fakeDeps, 'build')
    const names = csTools.map(t => t.name)
    expect(names).toContain('readFile')
    expect(names).toContain('grep')
    expect(names).toContain('glob')
    expect(names).toContain('webFetch')
    expect(names).not.toContain('bash')
    expect(names).not.toContain('lsp')
  })

  it('fix tier includes bash, lsp, readFile, grep, glob but NOT webFetch', () => {
    const { csTools } = buildToolSet(fakeDeps, 'fix')
    const names = csTools.map(t => t.name)
    expect(names).toContain('bash')
    expect(names).toContain('lsp')
    expect(names).toContain('readFile')
    expect(names).toContain('grep')
    expect(names).toContain('glob')
    expect(names).not.toContain('webFetch')
  })

  it('orchestrator tier includes all six new tools', () => {
    const { csTools } = buildToolSet(fakeDeps, 'orchestrator')
    const names = csTools.map(t => t.name)
    for (const name of ['readFile', 'grep', 'glob', 'bash', 'lsp', 'webFetch']) {
      expect(names).toContain(name)
    }
  })

  it('aiTools is a flat map of tool name to AI SDK tool', () => {
    const { aiTools } = buildToolSet(fakeDeps, 'build')
    expect(typeof aiTools).toBe('object')
    expect(Object.keys(aiTools).length).toBeGreaterThan(0)
    for (const tool of Object.values(aiTools)) {
      expect(tool).toHaveProperty('inputSchema')
      expect(tool).toHaveProperty('execute')
    }
  })
})
