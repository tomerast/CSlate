import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { AgentMessage, Session, SessionSummary } from '../../shared/agentTypes'

const MAX_TITLE_LENGTH = 200
const DEFAULT_TITLE = 'New conversation'

/**
 * Local session persistence. Sessions live at `~/.cslate/sessions/{id}.json`
 * and are keyed by UUID v4.
 *
 * Concurrency: every mutation serializes on a per-id promise chain so
 * simultaneous callers (e.g. auto-title firing while the assistant reply
 * is appending) can never interleave read-modify-write cycles.
 *
 * Search is a simple case-insensitive substring match over title + message
 * content; revisit if the sidebar ever feels slow.
 */
export class SessionStore {
  private readonly dir: string
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(rootDir?: string) {
    this.dir = rootDir ?? path.join(app.getPath('home'), '.cslate', 'sessions')
  }

  private file(id: string): string {
    if (!isValidId(id)) throw new Error(`Invalid session id: ${id}`)
    return path.join(this.dir, `${id}.json`)
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  private async readFile(id: string): Promise<Session | null> {
    try {
      const raw = await fs.readFile(this.file(id), 'utf-8')
      return JSON.parse(raw) as Session
    } catch {
      return null
    }
  }

  private async writeFile(session: Session): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(this.file(session.id), JSON.stringify(session, null, 2), 'utf-8')
  }

  /**
   * Run `work` while holding the per-id write lock. Concurrent callers for
   * the same id queue behind the previous pending operation.
   */
  private async withLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve()
    const next = previous.then(work, work)
    this.locks.set(
      id,
      next.finally(() => {
        if (this.locks.get(id) === next) this.locks.delete(id)
      }),
    )
    return next
  }

  async create(modelId: string): Promise<Session> {
    const now = Date.now()
    const session: Session = {
      id: randomUUID(),
      title: DEFAULT_TITLE,
      modelId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    return this.withLock(session.id, async () => {
      await this.writeFile(session)
      return session
    })
  }

  async get(id: string): Promise<Session | null> {
    return this.readFile(id)
  }

  async append(id: string, message: AgentMessage): Promise<Session | null> {
    return this.withLock(id, async () => {
      const session = await this.readFile(id)
      if (!session) return null
      session.messages.push(message)
      session.updatedAt = Date.now()
      await this.writeFile(session)
      return session
    })
  }

  async replaceMessages(id: string, messages: AgentMessage[]): Promise<Session | null> {
    return this.withLock(id, async () => {
      const session = await this.readFile(id)
      if (!session) return null
      session.messages = messages
      session.updatedAt = Date.now()
      await this.writeFile(session)
      return session
    })
  }

  async rename(id: string, title: string): Promise<Session | null> {
    const cleaned = sanitizeTitle(title)
    if (!cleaned) return null
    return this.withLock(id, async () => {
      const session = await this.readFile(id)
      if (!session) return null
      session.title = cleaned
      session.updatedAt = Date.now()
      await this.writeFile(session)
      return session
    })
  }

  /**
   * Only rename if the current title is still the default. Used by auto-title
   * so a user's manual rename is never overwritten by a slow LLM response.
   */
  async renameIfDefault(id: string, title: string): Promise<Session | null> {
    const cleaned = sanitizeTitle(title)
    if (!cleaned) return null
    return this.withLock(id, async () => {
      const session = await this.readFile(id)
      if (!session) return null
      if (session.title !== DEFAULT_TITLE) return session
      session.title = cleaned
      session.updatedAt = Date.now()
      await this.writeFile(session)
      return session
    })
  }

  async delete(id: string): Promise<boolean> {
    return this.withLock(id, async () => {
      try {
        await fs.unlink(this.file(id))
        return true
      } catch {
        return false
      }
    })
  }

  async list(): Promise<SessionSummary[]> {
    await this.ensureDir()
    const entries = await fs.readdir(this.dir)
    const summaries: SessionSummary[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const id = entry.slice(0, -'.json'.length)
      if (!isValidId(id)) continue
      const session = await this.readFile(id)
      if (!session) continue
      summaries.push(toSummary(session))
    }
    summaries.sort((a, b) => b.updatedAt - a.updatedAt)
    return summaries
  }

  async search(query: string): Promise<SessionSummary[]> {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return this.list()
    const all = await this.list()
    const hits: SessionSummary[] = []
    for (const summary of all) {
      if (summary.title.toLowerCase().includes(trimmed)) {
        hits.push(summary)
        continue
      }
      const session = await this.readFile(summary.id)
      if (!session) continue
      const match = session.messages.some((m) => m.content.toLowerCase().includes(trimmed))
      if (match) hits.push(summary)
    }
    return hits
  }
}

function toSummary(session: Session): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    modelId: session.modelId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  }
}

function sanitizeTitle(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH)
  return trimmed.length > 0 ? trimmed : null
}

function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
