import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'home') return os.tmpdir()
      throw new Error(`unexpected app.getPath(${name})`)
    },
  },
}))

import { SessionStore } from '../store'
import type { AgentMessage } from '../../../shared/agentTypes'

function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content: 'hi',
    cards: [],
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('SessionStore', () => {
  let dir: string
  let store: SessionStore

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cslate-session-test-'))
    store = new SessionStore(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('creates and retrieves a session', async () => {
    const created = await store.create('claude')
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.title).toBe('New conversation')
    expect(created.messages).toEqual([])

    const loaded = await store.get(created.id)
    expect(loaded?.id).toBe(created.id)
    expect(loaded?.modelId).toBe('claude')
  })

  it('returns null for an unknown id', async () => {
    const id = crypto.randomUUID()
    expect(await store.get(id)).toBeNull()
  })

  it('returns null for a malformed id instead of throwing', async () => {
    expect(await store.get('not-a-uuid')).toBeNull()
  })

  it('appends messages in order', async () => {
    const session = await store.create('claude')
    const a = makeMessage({ content: 'one' })
    const b = makeMessage({ role: 'assistant', content: 'two' })
    await store.append(session.id, a)
    const updated = await store.append(session.id, b)
    expect(updated?.messages.map((m) => m.content)).toEqual(['one', 'two'])
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(session.updatedAt)
  })

  it('replaceMessages truncates and rewrites', async () => {
    const session = await store.create('claude')
    await store.append(session.id, makeMessage({ content: 'a' }))
    await store.append(session.id, makeMessage({ role: 'assistant', content: 'b' }))
    const truncated = await store.replaceMessages(session.id, [
      makeMessage({ content: 'only-one' }),
    ])
    expect(truncated?.messages).toHaveLength(1)
    expect(truncated?.messages[0].content).toBe('only-one')
  })

  it('rename trims, collapses whitespace, rejects empty titles', async () => {
    const session = await store.create('claude')
    const renamed = await store.rename(session.id, '  Tesla   Weekly   ')
    expect(renamed?.title).toBe('Tesla Weekly')

    const rejected = await store.rename(session.id, '   ')
    expect(rejected).toBeNull()
  })

  it('renameIfDefault only overwrites the default title', async () => {
    const session = await store.create('claude')
    await store.rename(session.id, 'User Title')
    const result = await store.renameIfDefault(session.id, 'Auto Title')
    expect(result?.title).toBe('User Title')

    const fresh = await store.create('claude')
    const auto = await store.renameIfDefault(fresh.id, 'Auto Title')
    expect(auto?.title).toBe('Auto Title')
  })

  it('serializes concurrent writes with the per-id lock', async () => {
    const session = await store.create('claude')

    // Fire append + renameIfDefault + rename at the same time; with the
    // lock all three observe a linear history of the file.
    const results = await Promise.all([
      store.append(session.id, makeMessage({ content: 'user-msg' })),
      store.renameIfDefault(session.id, 'Auto Title'),
      store.rename(session.id, 'Manual Title'),
    ])
    expect(results.every((r) => r !== null)).toBe(true)

    const final = await store.get(session.id)
    expect(final?.messages).toHaveLength(1)
    expect(['Auto Title', 'Manual Title']).toContain(final?.title)
  })

  it('list returns summaries sorted by updatedAt desc', async () => {
    const a = await store.create('claude')
    await new Promise((r) => setTimeout(r, 2))
    const b = await store.create('claude')
    const list = await store.list()
    expect(list[0].id).toBe(b.id)
    expect(list[1].id).toBe(a.id)
    expect(list[0].messageCount).toBe(0)
  })

  it('search matches on title and message content', async () => {
    const a = await store.create('claude')
    await store.rename(a.id, 'Tesla Stock')
    const b = await store.create('claude')
    await store.append(b.id, makeMessage({ content: 'bitcoin price' }))

    const tesla = await store.search('tesla')
    expect(tesla.map((s) => s.id)).toEqual([a.id])

    const btc = await store.search('BITCOIN')
    expect(btc.map((s) => s.id)).toEqual([b.id])

    const none = await store.search('ethereum')
    expect(none).toEqual([])
  })

  it('delete removes the file and reports success', async () => {
    const session = await store.create('claude')
    expect(await store.delete(session.id)).toBe(true)
    expect(await store.get(session.id)).toBeNull()
    expect(await store.delete(session.id)).toBe(false)
  })
})
