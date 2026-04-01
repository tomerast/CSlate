import { describe, it, expect } from 'vitest'
import { validateManifest, validateManifestTool } from '../validateManifest'

describe('validateManifest tool execute', () => {
  it('returns valid=true for a minimal valid manifest', async () => {
    const manifest = {
      name: 'Test Component',
      description: 'A test component',
      tags: ['test'],
      inputs: {},
      outputs: {},
      events: {},
      actions: {},
      files: [{ path: 'ui.tsx', type: 'ui', role: 'main render' }],
      defaultSize: { width: 20, height: 15 },
    }
    const result = await validateManifest.execute!({ manifest }, {} as any) as { valid: boolean; errors: string[] }
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid=false and lists errors for missing required fields', async () => {
    const manifest = { name: 'Bad' }
    const result = await validateManifest.execute!({ manifest }, {} as any) as { valid: boolean; errors: string[] }
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('validateManifestTool CSTool interface', () => {
  it('has the correct name', () => {
    expect(validateManifestTool.name).toBe('validateManifest')
  })

  it('isReadOnly returns true', () => {
    expect(validateManifestTool.isReadOnly({ manifest: {} })).toBe(true)
  })

  it('isConcurrencySafe returns true', () => {
    expect(validateManifestTool.isConcurrencySafe({ manifest: {} })).toBe(true)
  })

  it('toAISDKTool returns an object with execute function', () => {
    const aiTool = validateManifestTool.toAISDKTool()
    expect(aiTool.description).toBe('Validate a component manifest against the CSlate schema. Always call this before writeComponent.')
    expect(typeof aiTool.execute).toBe('function')
  })

  it('direct call returns ToolResult with data wrapper', async () => {
    const manifest = {
      name: 'Test Component',
      description: 'A test component',
      tags: ['test'],
      inputs: {},
      outputs: {},
      events: {},
      actions: {},
      files: [{ path: 'ui.tsx', type: 'ui', role: 'main render' }],
      defaultSize: { width: 20, height: 15 },
    }
    const result = await validateManifestTool.call({ manifest })
    expect(result).toEqual({
      data: { valid: true, errors: [] }
    })
  })

  it('direct call with invalid manifest returns data with errors', async () => {
    const result = await validateManifestTool.call({ manifest: { name: 'Bad' } })
    expect(result.data.valid).toBe(false)
    expect(result.data.errors.length).toBeGreaterThan(0)
  })
})
