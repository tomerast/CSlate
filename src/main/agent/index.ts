import type { AgentRequest, AgentResponse } from '@shared/agentTypes'
import { AgentEngine, type EngineOptions } from './engine'
import { getConfigValue } from '../ipc/config'
import type { LLMConfig } from './providers'

/**
 * Legacy AgentRunner used by the simple `agent:generate` IPC channel.
 * Delegates to AgentEngine internally but provides a simpler non-streaming interface.
 */
export class AgentRunner {
  async run(request: AgentRequest, apiKey: string): Promise<AgentResponse> {
    const provider = (getConfigValue('llmProvider') as LLMConfig['provider']) ?? 'anthropic'
    const model = (getConfigValue('llmModel') as string) ?? 'claude-haiku-4-5-20251001'

    const config: LLMConfig = { provider, model, apiKey }

    // For the legacy generate path, we collect all text deltas into a single response
    const dummySender = { send: () => {} } as unknown as import('electron').WebContents
    const options: EngineOptions = {
      serverUrl: (getConfigValue('serverUrl') as string) ?? 'http://localhost:3000',
      serverApiKey: (getConfigValue('serverApiKey') as string | null) ?? '',
      sender: dummySender,
      tabId: request.sessionId,
    }

    const engine = new AgentEngine(config, request.projectDir ?? process.cwd(), options)
    let text = ''

    for await (const part of engine.stream({
      message: request.message,
      conversationHistory: request.history.map(m => ({ role: m.role, content: m.content })),
    })) {
      const p = part as Record<string, unknown>
      if (p['type'] === 'text-delta') {
        text += p['textDelta'] as string
      }
    }

    return { message: text || 'No response generated.' }
  }
}
