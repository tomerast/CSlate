import type { AgentMessage, Session, SessionSummary } from '@shared/agentTypes'

/**
 * Thin typed wrappers around the session:* IPC channels so the rest of
 * the renderer doesn't have to hand-cast `window.electron.invoke` results.
 */
export const sessionsApi = {
  list(): Promise<SessionSummary[]> {
    return window.electron.invoke('session:list') as Promise<SessionSummary[]>
  },
  get(id: string): Promise<Session | null> {
    return window.electron.invoke('session:get', { id }) as Promise<Session | null>
  },
  create(modelId: string): Promise<Session> {
    return window.electron.invoke('session:create', { modelId }) as Promise<Session>
  },
  append(id: string, message: AgentMessage): Promise<Session | null> {
    return window.electron.invoke('session:append', { id, message }) as Promise<Session | null>
  },
  replace(id: string, messages: AgentMessage[]): Promise<Session | null> {
    return window.electron.invoke('session:replace', { id, messages }) as Promise<Session | null>
  },
  rename(id: string, title: string): Promise<Session | null> {
    return window.electron.invoke('session:rename', { id, title }) as Promise<Session | null>
  },
  delete(id: string): Promise<boolean> {
    return window.electron.invoke('session:delete', { id }) as Promise<boolean>
  },
  search(query: string): Promise<SessionSummary[]> {
    return window.electron.invoke('session:search', { query }) as Promise<SessionSummary[]>
  },
  fork(id: string, fromMessageId: string): Promise<Session | null> {
    return window.electron.invoke('session:fork', { id, fromMessageId }) as Promise<Session | null>
  },
  autoTitle(id: string, prompt: string): Promise<Session | null> {
    return window.electron.invoke('session:auto-title', { id, prompt }) as Promise<Session | null>
  },
}
