import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

import { generateText } from 'ai'
import { spawnBuildAgent, spawnFixAgent, buildSubAgentPrompt } from '../orchestrator/sub-agent'
import type { BuildTask } from '../orchestrator/types'

const mockRegistry = { languageModel: vi.fn().mockReturnValue({}) }

describe('buildSubAgentPrompt', () => {
  it('includes contract and assignment', () => {
    const prompt = buildSubAgentPrompt({
      task: { file: 'ui.tsx', assignment: 'Build a kanban board', blueprint: null },
      contract: 'interface Props { columns: Column[] }',
    })
    expect(prompt).toContain('interface Props { columns: Column[] }')
    expect(prompt).toContain('Build a kanban board')
    expect(prompt).toContain('ui.tsx')
  })

  it('includes blueprint when provided', () => {
    const prompt = buildSubAgentPrompt({
      task: {
        file: 'ui.tsx',
        assignment: 'Adapt card layout',
        blueprint: 'function Component() { return <div>old</div> }',
      },
      contract: 'interface Props {}',
    })
    expect(prompt).toContain('function Component() { return <div>old</div> }')
    expect(prompt).toContain('ADAPT')
  })

  it('says build from scratch when no blueprint', () => {
    const prompt = buildSubAgentPrompt({
      task: { file: 'logic.ts', assignment: 'Build data hooks', blueprint: null },
      contract: 'interface Props {}',
    })
    expect(prompt).toContain('from scratch')
  })
})

describe('spawnBuildAgent', () => {
  it('returns SubAgentResult on success', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'function Component(props) { return <div>kanban</div> }',
    } as any)

    const result = await spawnBuildAgent({
      task: { file: 'ui.tsx', assignment: 'Build kanban UI', blueprint: null },
      contract: 'interface Props {}',
      modelId: 'anthropic:claude-sonnet-4-6',
      registry: mockRegistry,
    })

    expect(result.file).toBe('ui.tsx')
    expect(result.status).toBe('success')
    expect(result.code).toContain('kanban')
    expect(result.error).toBeNull()
  })

  it('returns error status on failure', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('API timeout'))

    const result = await spawnBuildAgent({
      task: { file: 'ui.tsx', assignment: 'Build UI', blueprint: null },
      contract: '',
      modelId: 'anthropic:claude-sonnet-4-6',
      registry: mockRegistry,
    })

    expect(result.status).toBe('error')
    expect(result.error).toContain('API timeout')
  })
})

describe('spawnFixAgent', () => {
  it('returns fixed code on success', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'function Component(props) { return <div>fixed</div> }',
    } as any)

    const result = await spawnFixAgent({
      file: 'ui.tsx',
      brokenCode: 'function Component(props) { return <div>broken',
      error: 'Unexpected end of input',
      contract: 'interface Props {}',
      modelId: 'anthropic:claude-sonnet-4-6',
      registry: mockRegistry,
    })

    expect(result.status).toBe('success')
    expect(result.code).toContain('fixed')
  })
})
