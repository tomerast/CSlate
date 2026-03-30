import type { IpcMain, WebContents } from 'electron'
import { AgentEngine } from './engine'
import { getConfigValue } from '../ipc/config'
import type { LLMConfig } from './providers'

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('agent:run', async (event, {
    message,
    projectDir,
    tabId,
    conversationHistory = [],
    targetComponentId,
  }: {
    message: string
    projectDir: string
    tabId: string
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
    targetComponentId?: string
  }) => {
    const sender: WebContents = event.sender

    // Load LLM config from secure storage
    const gatewayMode = (getConfigValue('gatewayMode') as string) ?? 'direct'
    const gatewayUrl = (getConfigValue('gatewayUrl') as string) ?? ''
    const llmModel = (getConfigValue('llmModel') as string) ?? 'anthropic/claude-sonnet-4.6'
    const apiKey = (getConfigValue('llmApiKey') as string | null) ?? undefined
    const serverUrl = (getConfigValue('serverUrl') as string) ?? 'http://localhost:3000'
    const serverApiKey = (getConfigValue('serverApiKey') as string | null) ?? ''

    // Native model IDs for direct API calls (provider SDKs don't use the provider/ prefix)
    const DIRECT_MODEL_IDS: Record<string, string> = {
      'anthropic/claude-sonnet-4-6': 'claude-sonnet-4-6',
      'anthropic/claude-haiku-4-5': 'claude-haiku-4-5',
      'openai/gpt-4o': 'gpt-4o',
      'openai/gpt-4o-mini': 'gpt-4o-mini',
      'google/gemini-2.5-pro': 'gemini-2.5-pro-preview',
      'google/gemini-2.5-flash': 'gemini-2.5-flash-preview',
    }

    // Derive provider + model ID + baseUrl from gateway config
    let provider: LLMConfig['provider']
    let model: string
    let baseUrl: string | undefined

    if (gatewayMode !== 'direct') {
      // All gateways are OpenAI-compatible — pass full model ID (e.g. 'moonshotai/kimi-k2.5')
      provider = 'openai'
      baseUrl = gatewayUrl
      // Portkey requires @ prefix for provider routing
      model = gatewayMode === 'portkey' ? `@${llmModel}` : llmModel
    } else {
      // Direct mode — use native provider model ID, derive SDK provider from prefix
      if (llmModel.startsWith('anthropic/')) {
        provider = 'anthropic'
        model = DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('anthropic/'.length)
      } else if (llmModel.startsWith('openai/')) {
        provider = 'openai'
        model = DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('openai/'.length)
      } else if (llmModel.startsWith('google/')) {
        provider = 'google'
        model = DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('google/'.length)
      } else {
        provider = 'local'
        model = llmModel
      }
    }

    // Check if provider is configured
    const isLocal = provider === 'local'
    if (!apiKey && !isLocal) {
      sender.send('agent:error', {
        message: 'No AI provider configured. Open Settings (⌘,) to set up your model and API key.',
        code: 'UNCONFIGURED_LLM'
      })
      return { ok: true }
    }

    const config: LLMConfig = { provider, model, apiKey, baseUrl }

    const engine = new AgentEngine(config, projectDir, {
      serverUrl,
      serverApiKey,
      sender,
      tabId,
    })

    try {
      for await (const part of engine.stream({ message, conversationHistory, targetComponentId })) {
        const p = part as Record<string, unknown>
        switch (p['type']) {
          case 'text-delta':
            sender.send('agent:token', { delta: p['textDelta'] })
            break
          case 'tool-call':
            sender.send('agent:tool-call', { tool: p['toolName'], input: p['args'] })
            break
          case 'tool-result':
            sender.send('agent:tool-result', { tool: p['toolName'], result: p['result'] })
            break
          case 'finish':
            sender.send('agent:done', { usage: (p['response'] as any)?.usage ?? {} })
            break
          case 'error':
            sender.send('agent:error', { message: String((p['error'] as Error)?.message ?? p['error']) })
            break
        }
      }
    } catch (err: unknown) {
      sender.send('agent:error', { message: err instanceof Error ? err.message : String(err) })
    }

    return { ok: true }
  })
}
