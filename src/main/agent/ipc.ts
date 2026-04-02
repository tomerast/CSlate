import type { IpcMain, WebContents } from 'electron'
import { AgentEngine } from './engine'
import { getConfigValue } from '../ipc/config'
import type { LLMConfig } from '@cslate/shared/agent'
import type { PermissionBroker } from './tools/bash/permissions'
import { agentLog, logFile } from '../lib/logger'

const DIRECT_MODEL_IDS: Record<string, string> = {
  'anthropic/claude-sonnet-4-6': 'claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5': 'claude-haiku-4-5',
  'anthropic/claude-opus-4-6': 'claude-opus-4-6',
  'openai/gpt-4o': 'gpt-4o',
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'google/gemini-2.5-pro': 'gemini-2.5-pro-preview',
  'google/gemini-2.5-flash': 'gemini-2.5-flash-preview',
  'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
}

// Module-level permission registry (shared across all agent:run sessions)
const pendingPermissions = new Map<string, (approved: boolean) => void>()

function parseModelId(llmModel: string): { provider: LLMConfig['provider']; model: string } {
  if (llmModel.startsWith('anthropic/')) {
    return { provider: 'anthropic', model: DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('anthropic/'.length) }
  }
  if (llmModel.startsWith('openai/')) {
    return { provider: 'openai', model: DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('openai/'.length) }
  }
  if (llmModel.startsWith('google/')) {
    return { provider: 'google', model: DIRECT_MODEL_IDS[llmModel] ?? llmModel.slice('google/'.length) }
  }
  return { provider: 'local', model: llmModel }
}

export function register(ipcMain: IpcMain): void {
  agentLog.info({ logFile }, 'agent IPC registered')

  // Register permission response handler once at module level
  ipcMain.handle('agent:permission-response', (_evt, { requestId, approved }: { requestId: string; approved: boolean }) => {
    const resolve = pendingPermissions.get(requestId)
    if (resolve) {
      pendingPermissions.delete(requestId)
      resolve(approved)
    }
  })

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
    const log = agentLog.child({ tabId })

    log.info({ message, historyLength: conversationHistory.length }, 'agent:run received')

    // ---- Permission broker for bash tool ----
    const permissionBroker: PermissionBroker = {
      request(command: string): Promise<boolean> {
        return new Promise((resolve) => {
          const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2)}`
          pendingPermissions.set(requestId, resolve)
          event.sender.send('agent:permission-request', { requestId, command })
          setTimeout(() => {
            if (pendingPermissions.has(requestId)) {
              pendingPermissions.delete(requestId)
              resolve(false)
            }
          }, 30_000)
        })
      },
    }

    // Load LLM config from secure storage
    const gatewayUrl = (getConfigValue('gatewayUrl') as string) ?? ''
    const llmModel = (getConfigValue('llmModel') as string) ?? 'anthropic/claude-sonnet-4-6'
    const apiKey = (getConfigValue('llmApiKey') as string | null) ?? undefined
    const serverUrl = (getConfigValue('serverUrl') as string) ?? 'http://localhost:3000'
    const serverApiKey = (getConfigValue('serverApiKey') as string | null) ?? ''

    let provider: LLMConfig['provider']
    let model: string
    let baseUrl: string | undefined

    if (gatewayUrl) {
      provider = 'openai'
      model = llmModel
      baseUrl = gatewayUrl
    } else {
      ({ provider, model } = parseModelId(llmModel))
    }

    log.debug({ provider, model, baseUrl: baseUrl ?? '(direct)', hasApiKey: !!apiKey }, 'config resolved')

    const isLocal = provider === 'local'
    if (!apiKey && !isLocal) {
      log.warn({ provider, model }, 'no API key configured')
      sender.send('agent:error', {
        message: 'No API key configured. Open Settings (⌘,) to set up your provider.',
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
      permissionBroker,
    })

    log.debug('engine created, starting stream')
    try {
      for await (const part of engine.stream({ message, conversationHistory, targetComponentId })) {
        const p = part as Record<string, unknown>
        switch (p['type']) {
          case 'text-delta':
            sender.send('agent:token', { delta: p['text'] })
            break
          case 'tool-call':
            log.debug({ tool: p['toolName'], input: p['input'] }, 'tool-call')
            sender.send('agent:tool-call', { tool: p['toolName'], input: p['input'] })
            break
          case 'tool-result':
            log.debug({ tool: p['toolName'] }, 'tool-result')
            sender.send('agent:tool-result', { tool: p['toolName'], result: p['result'] })
            break
          case 'finish':
            log.info({ usage: (p['response'] as any)?.usage }, 'stream finished')
            sender.send('agent:done', { usage: (p['response'] as any)?.usage ?? {} })
            break
          case 'error':
            log.error({ err: p['error'] }, 'stream error part')
            sender.send('agent:error', { message: String((p['error'] as Error)?.message ?? p['error']) })
            break
        }
      }
    } catch (err: unknown) {
      log.error({ err }, 'agent:run threw')
      sender.send('agent:error', { message: err instanceof Error ? err.message : String(err) })
    }

    return { ok: true }
  })
}
