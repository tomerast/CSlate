import { describe, it, expect, vi } from 'vitest'

vi.mock('@cslate/shared/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cslate/shared/agent')>()
  return {
    ...actual,
    runSubAgent: vi.fn(),
  }
})

import { runSubAgent } from '@cslate/shared/agent'
import { createReviewCodeTool } from '../reviewCode'

describe('reviewCode sub-agent tool', () => {
  it('returns passed=true when reviewer finds no issues', async () => {
    vi.mocked(runSubAgent).mockResolvedValue({
      text: JSON.stringify({ passed: true, issues: [], suggestions: ['Consider adding aria-labels'] }),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      steps: 1,
    })

    const tool = createReviewCodeTool({ languageModel: vi.fn().mockReturnValue({}) } as any, 'local:test').toAISDKTool()
    const result = await tool.execute!({
      files: { 'ui.tsx': 'export default function Foo() { return <div>hi</div> }' },
      manifest: {
        name: 'Foo', description: 'test', tags: [], inputs: {}, outputs: {},
        events: {}, actions: {}, files: [], defaultSize: { width: 10, height: 10 }
      }
    }, {} as any) as { passed: boolean; issues: string[]; suggestions: string[] }

    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns passed=false when reviewer finds issues', async () => {
    vi.mocked(runSubAgent).mockResolvedValue({
      text: JSON.stringify({ passed: false, issues: ['Uses eval()'], suggestions: [] }),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      steps: 1,
    })

    const tool = createReviewCodeTool({ languageModel: vi.fn().mockReturnValue({}) } as any, 'local:test').toAISDKTool()
    const result = await tool.execute!({
      files: { 'ui.tsx': 'eval("bad")' },
      manifest: { name: 'Bad', description: '', tags: [], inputs: {}, outputs: {},
        events: {}, actions: {}, files: [], defaultSize: { width: 10, height: 10 } }
    }, {} as any) as { passed: boolean; issues: string[]; suggestions: string[] }

    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Uses eval()')
  })
})
