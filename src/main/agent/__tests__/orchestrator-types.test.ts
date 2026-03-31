import { describe, it, expect } from 'vitest'
import { ComponentPlanSchema, BuildTaskSchema, SubAgentResultSchema, BlueprintMatchSchema } from '../orchestrator/types'

describe('Orchestrator types', () => {
  it('validates a minimal ComponentPlan', () => {
    const plan = {
      componentId: 'kanban_board',
      requirements: 'A kanban board with drag and drop',
      contract: 'interface Props { columns: Column[] }',
      tasks: [
        { file: 'ui.tsx', assignment: 'Build the main kanban UI', blueprint: null },
      ],
      blueprintMatch: null,
    }
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(true)
  })

  it('validates a BuildTask with blueprint', () => {
    const task = {
      file: 'ui.tsx',
      assignment: 'Adapt the card layout to use horizontal columns',
      blueprint: 'function Component(props) { return <div>card</div> }',
    }
    expect(BuildTaskSchema.safeParse(task).success).toBe(true)
  })

  it('validates a SubAgentResult', () => {
    const result = {
      file: 'ui.tsx',
      code: 'function Component(props) { return <div /> }',
      status: 'success' as const,
      error: null,
    }
    expect(SubAgentResultSchema.safeParse(result).success).toBe(true)
  })

  it('validates a BlueprintMatch', () => {
    const match = {
      componentId: 'server_kanban_123',
      name: 'Kanban Board',
      similarity: 0.87,
      source: { 'ui.tsx': 'function Component() {}', 'manifest.json': '{}' },
      strength: 'strong' as const,
    }
    expect(BlueprintMatchSchema.safeParse(match).success).toBe(true)
  })

  it('rejects ComponentPlan without tasks', () => {
    const plan = {
      componentId: 'test',
      requirements: 'test',
      contract: '',
      tasks: [],
      blueprintMatch: null,
    }
    expect(ComponentPlanSchema.safeParse(plan).success).toBe(false)
  })
})
