import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { AgentMessage, Session, SessionSummary } from '../../shared/agentTypes'

/**
 * Local session persistence. Sessions live at ~/.cslate/sessions/{id}.json
 * and are keyed by UUID v4. Search is a simple case-insensitive substring
 * match over title + message content (good enough for now; revisit if the
 * sidebar ever feels slow).
 */
export class SessionStore {
  private readonly dir: string

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

  async create(modelId: string): Promise<Session> {
    const now = Date.now()
    const session: Session = {
      id: randomUUID(),
      title: 'New conversation',
      modelId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    await this.writeFile(session)
    return session
  }

  async get(id: string): Promise<Session | null> {
    return this.readFile(id)
  }

  async append(id: string, message: AgentMessage): Promise<Session | null> {
    const session = await this.readFile(id)
    if (!session) return null
    session.messages.push(message)
    session.updatedAt = Date.now()
    await this.writeFile(session)
    return session
  }

  async replaceMessages(id: string, messages: AgentMessage[]): Promise<Session | null> {
    const session = await this.readFile(id)
    if (!session) return null
    session.messages = messages
    session.updatedAt = Date.now()
    await this.writeFile(session)
    return session
  }

  async rename(id: string, title: string): Promise<Session | null> {
    const session = await this.readFile(id)
    if (!session) return null
    session.title = title
    session.updatedAt = Date.now()
    await this.writeFile(session)
    return session
  }

  async delete(id: string): Promise<boolean> {
    try {
      await fs.unlink(this.file(id))
      return true
    } catch {
      return false
    }
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
      const match = session.messages.some((m) =>
        m.content.toLowerCase().includes(trimmed),
      )
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

function isValidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
