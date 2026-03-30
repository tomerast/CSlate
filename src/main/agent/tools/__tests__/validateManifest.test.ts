import { describe, it, expect } from 'vitest'
import { validateManifest } from '../validateManifest'

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
