import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { MemoryEntry, NewMemoryEntry } from './types'

export class MemoryManager {
  private dir: string

  constructor(projectDir: string | null) {
    const base = projectDir
      ? join(projectDir, '.cslate', 'agent', 'memory')
      : join(process.env['HOME'] ?? '/tmp', '.cslate', 'agent', 'memory')
    this.dir = base
  }

  private ensureDir(): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`)
  }

  private indexPath(): string {
    return join(this.dir, 'index.json')
  }

  private readIndex(): Record<string, string> {
    if (!existsSync(this.indexPath())) return {}
    try {
      return JSON.parse(readFileSync(this.indexPath(), 'utf-8'))
    } catch {
      return {}
    }
  }

  private writeIndex(index: Record<string, string>): void {
    this.ensureDir()
    writeFileSync(this.indexPath(), JSON.stringify(index, null, 2))
  }

  async save(entry: NewMemoryEntry): Promise<MemoryEntry> {
    this.ensureDir()
    const index = this.readIndex()
    const key = `${entry.type}:${entry.name}`
    const existingId = index[key]
    const now = Date.now()
    const saved: MemoryEntry = {
      id: existingId ?? randomUUID(),
      ...entry,
      createdAt: existingId
        ? JSON.parse(readFileSync(this.filePath(existingId), 'utf-8')).createdAt
        : now,
      updatedAt: now
    }
    writeFileSync(this.filePath(saved.id), JSON.stringify(saved, null, 2))
    index[key] = saved.id
    this.writeIndex(index)
    return saved
  }

  async getAll(): Promise<MemoryEntry[]> {
    const index = this.readIndex()
    return Object.values(index)
      .map((id) => {
        try {
          return JSON.parse(readFileSync(this.filePath(id), 'utf-8')) as MemoryEntry
        } catch {
          return null
        }
      })
      .filter((e): e is MemoryEntry => e !== null)
  }

  async delete(id: string): Promise<void> {
    const index = this.readIndex()
    const key = Object.keys(index).find((k) => index[k] === id)
    if (!key) return
    delete index[key]
    this.writeIndex(index)
    const fp = this.filePath(id)
    if (existsSync(fp)) unlinkSync(fp)
  }
}
