import { describe, it, expect, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))

import { generateText } from 'ai'
import { spawnBuildAgent, spawnFixAgent, buildSubAgentPrompt } from '../orchestrator/sub-agent'
import type { BuildTask } from '../orchestrator/types'
import { PLATFORM_KNOWLEDGE } from '../prompts/fragments'

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

  it('injects STARTING POINT section for known template files when no blueprint', () => {
    for (const file of ['ui.tsx', 'logic.ts', 'types.ts', 'manifest.json', 'context.md']) {
      const prompt = buildSubAgentPrompt({
        task: { file, assignment: 'Build it', blueprint: null },
        contract: 'interface Props {}',
      })
      expect(prompt, `${file} should have STARTING POINT`).toContain('STARTING POINT')
      expect(prompt, `${file} should not say No template available`).not.toContain('No template available')
    }
  })

  it('says no template available for unknown file names when no blueprint', () => {
    const prompt = buildSubAgentPrompt({
      task: { file: 'custom-helper.ts', assignment: 'Build a helper', blueprint: null },
      contract: 'interface Props {}',
    })
    expect(prompt).toContain('No template available')
    expect(prompt).not.toContain('STARTING POINT')
  })

  it('community blueprint takes priority over template', () => {
    const prompt = buildSubAgentPrompt({
      task: {
        file: 'ui.tsx',
        assignment: 'Adapt card layout',
        blueprint: 'function Component() { return <div>blueprint</div> }',
      },
      contract: 'interface Props {}',
    })
    expect(prompt).toContain('BLUEPRINT')
    expect(prompt).toContain('blueprint')
    expect(prompt).not.toContain('STARTING POINT')
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

describe('PLATFORM_KNOWLEDGE', () => {
  it('contains bridge-safe loading guidance', () => {
    expect(PLATFORM_KNOWLEDGE).toContain('seed data')
    expect(PLATFORM_KNOWLEDGE).toContain('bridge')
  })

  it('warns against loading initialized to true with bridge guard', () => {
    expect(PLATFORM_KNOWLEDGE).toContain('useState(false)')
  })
})
