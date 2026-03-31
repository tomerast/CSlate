import { describe, it, expect } from 'vitest'
import { buildOrchestratorSystemPrompt } from '../orchestrator/prompts'

describe('buildOrchestratorSystemPrompt', () => {
  it('includes platform knowledge', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      canvasContext: '',
    })
    expect(prompt).toContain('CSlate Platform Rules')
  })

  it('includes orchestrator role description', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      canvasContext: '',
    })
    expect(prompt).toContain('You are the CSlate Orchestrator')
    expect(prompt).toContain('You NEVER write component code yourself')
  })

  it('includes memory context when provided', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '### User Preferences\nPrefers dark themes',
      canvasContext: '',
    })
    expect(prompt).toContain('Prefers dark themes')
  })

  it('includes canvas context when provided', () => {
    const prompt = buildOrchestratorSystemPrompt({
      memoryContext: '',
      canvasContext: '- stock_ticker: "Stock Ticker"',
    })
    expect(prompt).toContain('stock_ticker')
  })
})
