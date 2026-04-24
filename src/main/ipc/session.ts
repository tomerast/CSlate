import type { IpcMain } from 'electron'
import { z } from 'zod'
import { buildRegistry, fastModelId, runStructuredAgent } from '@cslate/shared/agent'
import { SessionStore } from '../sessions/store'
import { resolveLLMConfig } from '../agent/config-resolver'
import type { AgentMessage } from '../../shared/agentTypes'
import { agentLog } from '../lib/logger'

const store = new SessionStore()

const TitleSchema = z.object({
  title: z.string().min(1).max(80),
})

const TITLE_SYSTEM = `You name conversations. Given the user's first message, produce a short, specific title (2-6 words, Title Case, no trailing punctuation). Describe the topic, not the action. Examples:
- "what's the capital of Peru" -> "Capital of Peru"
- "show me tesla stock this week" -> "Tesla Weekly Performance"
- "build me a pomodoro timer" -> "Pomodoro Timer Component"`

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('session:list', () => store.list())

  ipcMain.handle('session:get', (_e, { id }: { id: string }) => store.get(id))

  ipcMain.handle('session:create', (_e, { modelId }: { modelId: string }) =>
    store.create(modelId),
  )

  ipcMain.handle(
    'session:append',
    (_e, { id, message }: { id: string; message: AgentMessage }) =>
      store.append(id, message),
  )

  ipcMain.handle(
    'session:replace',
    (_e, { id, messages }: { id: string; messages: AgentMessage[] }) =>
      store.replaceMessages(id, messages),
  )

  ipcMain.handle(
    'session:rename',
    (_e, { id, title }: { id: string; title: string }) => store.rename(id, title),
  )

  ipcMain.handle('session:delete', (_e, { id }: { id: string }) => store.delete(id))

  ipcMain.handle('session:search', (_e, { query }: { query: string }) =>
    store.search(query),
  )

  ipcMain.handle(
    'session:fork',
    async (_e, { id, fromMessageId }: { id: string; fromMessageId: string }) => {
      const source = await store.get(id)
      if (!source) return null
      const idx = source.messages.findIndex((m) => m.id === fromMessageId)
      if (idx < 0) return null
      const slice = source.messages.slice(0, idx + 1)
      const forked = await store.create(source.modelId)
      return store.replaceMessages(forked.id, slice)
    },
  )

  ipcMain.handle(
    'session:auto-title',
    async (_e, { id, prompt }: { id: string; prompt: string }) => {
      const log = agentLog.child({ component: 'auto-title', sessionId: id })
      const config = resolveLLMConfig()
      if (!config) {
        log.warn('no LLM configured — skipping auto-title')
        return null
      }
      try {
        const registry = buildRegistry(config)
        const result = await runStructuredAgent({
          modelId: fastModelId(config),
          registry,
          system: TITLE_SYSTEM,
          prompt,
          schema: TitleSchema,
        })
        const cleaned = result.title.replace(/["'.]+$/g, '').trim()
        log.info({ title: cleaned }, 'title generated')
        return store.rename(id, cleaned)
      } catch (err) {
        log.warn({ err }, 'auto-title failed')
        return null
      }
    },
  )
}
