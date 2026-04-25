import { app, type IpcMain, type WebContents } from 'electron'
import path from 'path'
import { AgentEngine } from './engine'
import { getConfigValue } from '../ipc/config'
import { buildRegistry } from '@cslate/shared/agent'
import { resolveLLMConfig } from './config-resolver'
import type { PermissionBroker } from './tools/bash/permissions'
import { loadUserMemory } from '../memory/context'
import { extractAndStoreUiMemories } from '../memory/auto-extract'
import { agentLog, logFile } from '../lib/logger'

// Module-level permission registry (shared across all agent:run sessions)
const pendingPermissions = new Map<string, (approved: boolean) => void>()

// Track active runs so a new request cancels the previous one
const activeRuns = new Map<string, AbortController>()

function resolveProjectDir(projectDir: string): string {
  if (projectDir && path.isAbsolute(projectDir)) return projectDir
  return path.join(app.getPath('userData'), 'default-project')
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

  // Explicit cancellation from the renderer (e.g. when the user loads a
  // different session while a stream is in flight). Idempotent: no-op if
  // there is no active run for this WebContents.
  ipcMain.handle('agent:abort', (event) => {
    const senderId = String(event.sender.id)
    const current = activeRuns.get(senderId)
    if (current) {
      current.abort()
      activeRuns.delete(senderId)
      agentLog.info({ senderId }, 'agent:abort — stream cancelled by renderer')
    }
    return { ok: true }
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

    const resolvedProjectDir = resolveProjectDir(projectDir)

    log.info({ message, historyLength: conversationHistory.length, projectDir: resolvedProjectDir }, 'agent:run received')

    // Cancel any in-progress run from the same renderer window
    const senderId = String(sender.id)
    const prev = activeRuns.get(senderId)
    if (prev) {
      log.info('aborting previous run (superseded by new request)')
      prev.abort()
      activeRuns.delete(senderId)
    }
    const abortController = new AbortController()
    activeRuns.set(senderId, abortController)

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
    const serverUrl = (getConfigValue('serverUrl') as string) ?? 'http://localhost:3000'
    const serverApiKey = (getConfigValue('serverApiKey') as string | null) ?? ''
    const config = resolveLLMConfig()

    log.debug({
      provider: config?.provider ?? '(none)',
      model: config?.model ?? '(none)',
      baseUrl: config?.baseUrl ?? '(direct)',
      hasApiKey: !!config?.apiKey,
    }, 'config resolved')

    if (!config) {
      log.warn('no API key configured')
      sender.send('agent:error', {
        message: 'No API key configured. Open Settings (⌘,) to set up your provider.',
        code: 'UNCONFIGURED_LLM'
      })
      return { ok: true }
    }

    const engine = new AgentEngine(config, resolvedProjectDir, {
      serverUrl,
      serverApiKey,
      sender,
      tabId,
      permissionBroker,
    })

    log.debug('engine created, starting stream')
    const assistantText: string[] = []
    let completed = false
    try {
      for await (const part of engine.stream({
        message,
        conversationHistory,
        targetComponentId,
        abortSignal: abortController.signal,
      })) {
        const p = part as Record<string, unknown>
        switch (p['type']) {
          case 'text-delta':
            assistantText.push(String(p['text'] ?? ''))
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
            completed = true
            log.info({ usage: (p['response'] as any)?.usage }, 'stream finished')
            sender.send('agent:done', { usage: (p['response'] as any)?.usage ?? {} })
            break
          case 'error':
            log.error({ err: p['error'] }, 'stream error part')
            sender.send('agent:error', { message: String((p['error'] as Error)?.message ?? p['error']) })
            break
        }
      }
      if (completed && !abortController.signal.aborted) {
        void loadUserMemory()
          .then((userMemory) =>
            extractAndStoreUiMemories({
              message,
              assistantText: assistantText.join(''),
              history: conversationHistory,
              userMemory,
              config,
              registry: buildRegistry(config),
            }),
          )
          .catch((err) => log.warn({ err }, 'failed to schedule UI memory extraction'))
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        log.info('agent:run aborted (superseded by new request)')
      } else {
        log.error({ err }, 'agent:run threw')
        sender.send('agent:error', { message: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      // Only delete if this is still the active controller (not already replaced)
      if (activeRuns.get(senderId) === abortController) {
        activeRuns.delete(senderId)
      }
    }

    return { ok: true }
  })
}
