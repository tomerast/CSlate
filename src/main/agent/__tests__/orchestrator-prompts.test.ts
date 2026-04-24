import { describe, it, expect } from 'vitest'
import { buildOrchestratorSystemPrompt } from '../orchestrator/prompts'

describe('buildOrchestratorSystemPrompt', () => {
  it('includes platform knowledge', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      cardContext: '',
    })
    expect(prompt).toContain('CSlate Platform Rules')
  })

  it('includes orchestrator role description', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      cardContext: '',
    })
    expect(prompt).toContain('You are the CSlate Orchestrator')
    expect(prompt).toContain('You NEVER write component code yourself')
  })

  it('includes memory context when provided', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '### User Preferences\nPrefers dark themes',
      cardContext: '',
    })
    expect(prompt).toContain('Prefers dark themes')
  })

  it('includes card context when provided', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      cardContext: '- stock_ticker: "Stock Ticker"',
    })
    expect(prompt).toContain('stock_ticker')
  })

  it('includes exact dispatch input when resuming a saved plan', () => {
    const resumePlanContext = JSON.stringify({
      componentId: 'stock_ticker',
      contract: '',
      tasks: [
        { file: 'ui.tsx', assignment: 'Build the card UI', blueprint: null },
        { file: 'manifest.json', assignment: 'Build the manifest', blueprint: null },
      ],
      pipelines: [],
    }, null, 2)

    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      cardContext: '',
      resumePhase: 'planned',
      resumePlanContext,
    })

    expect(prompt).toContain('## Existing Plan')
    expect(prompt).toContain('"componentId": "stock_ticker"')
    expect(prompt).toContain('Use this exact JSON as the dispatchSubAgents input')
  })
})
