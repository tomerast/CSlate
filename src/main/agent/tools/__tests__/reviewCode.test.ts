import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  tool: vi.fn((config) => config),
  generateText: vi.fn()
}))

import { generateText } from 'ai'
import { createReviewCodeTool } from '../reviewCode'

describe('reviewCode sub-agent tool', () => {
  it('returns passed=true when reviewer finds no issues', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ passed: true, issues: [], suggestions: ['Consider adding aria-labels'] })
    } as any)

    const tool = createReviewCodeTool({ languageModel: vi.fn().mockReturnValue({}) } as any, 'local:test')
    const result = await tool.execute!({
      files: { 'ui.tsx': 'export default function Foo() { return <div>hi</div> }' },
      manifest: {
        name: 'Foo', description: 'test', tags: [], inputs: {}, outputs: {},
        events: {}, actions: {}, files: [], defaultSize: { width: 10, height: 10 }
      }
    }, {} as any)

    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns passed=false when reviewer finds issues', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({ passed: false, issues: ['Uses eval()'], suggestions: [] })
    } as any)

    const tool = createReviewCodeTool({ languageModel: vi.fn().mockReturnValue({}) } as any, 'local:test')
    const result = await tool.execute!({
      files: { 'ui.tsx': 'eval("bad")' },
      manifest: { name: 'Bad', description: '', tags: [], inputs: {}, outputs: {},
        events: {}, actions: {}, files: [], defaultSize: { width: 10, height: 10 } }
    }, {} as any)

    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Uses eval()')
  })
})
