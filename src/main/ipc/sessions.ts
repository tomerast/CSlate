import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { IpcMain } from 'electron'
import { safeComponentId } from '../lib/paths'

function isSafeSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

interface SessionMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface SessionFile {
  id: string
  createdAt: number
  updatedAt: number
  componentIds: string[]
  messages: SessionMessage[]
}

interface ComponentSidecar {
  sessionIds: string[]
}

interface ComponentEntry {
  componentId: string
  manifest: unknown
  lastEditedAt: number
  onCanvas: boolean
  sessionIds: string[]
}

function sessionsDir(projectDir: string): string {
  return path.join(projectDir || process.cwd(), '.cslate', 'sessions')
}

function sessionFile(projectDir: string, sessionId: string): string {
  return path.join(sessionsDir(projectDir), `${sessionId}.json`)
}

function sidecarFile(projectDir: string, componentId: string): string {
  return path.join(projectDir || process.cwd(), 'components', componentId, 'session.json')
}

async function readSidecar(projectDir: string, componentId: string): Promise<ComponentSidecar> {
  try {
    const raw = await fs.readFile(sidecarFile(projectDir, componentId), 'utf-8')
    return JSON.parse(raw) as ComponentSidecar
  } catch {
    return { sessionIds: [] }
  }
}

async function writeSidecar(projectDir: string, componentId: string, sidecar: ComponentSidecar): Promise<void> {
  await fs.writeFile(sidecarFile(projectDir, componentId), JSON.stringify(sidecar, null, 2), 'utf-8')
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('session:create', async (_e, { projectDir }: { projectDir: string }) => {
    const sessionId = randomUUID()
    const dir = sessionsDir(projectDir)
    await fs.mkdir(dir, { recursive: true })
    const session: SessionFile = {
      id: sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      componentIds: [],
      messages: [],
    }
    await fs.writeFile(sessionFile(projectDir, sessionId), JSON.stringify(session, null, 2), 'utf-8')
    return { sessionId }
  })

  ipcMain.handle('session:save', async (_e, {
    projectDir,
    sessionId,
    componentIds,
    messages,
  }: {
    projectDir: string
    sessionId: string
    componentIds: string[]
    messages: SessionMessage[]
  }) => {
    if (!sessionId || !isSafeSessionId(sessionId)) return { ok: false }
    const dir = sessionsDir(projectDir)
    await fs.mkdir(dir, { recursive: true })

    let existing: Partial<SessionFile> = {}
    try {
      const raw = await fs.readFile(sessionFile(projectDir, sessionId), 'utf-8')
      existing = JSON.parse(raw) as Partial<SessionFile>
    } catch { /* new session */ }

    const session: SessionFile = {
      id: sessionId,
      createdAt: existing.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      componentIds,
      messages,
    }
    await fs.writeFile(sessionFile(projectDir, sessionId), JSON.stringify(session, null, 2), 'utf-8')

    for (const componentId of componentIds) {
      try {
        safeComponentId(componentId)
        const sidecar = await readSidecar(projectDir, componentId)
        if (!sidecar.sessionIds.includes(sessionId)) {
          sidecar.sessionIds.push(sessionId)
          await writeSidecar(projectDir, componentId, sidecar)
        }
      } catch { /* skip invalid componentIds */ }
    }

    return { ok: true }
  })

  ipcMain.handle('session:load', async (_e, {
    projectDir,
    sessionId,
  }: {
    projectDir: string
    sessionId: string
  }) => {
    if (!sessionId || !isSafeSessionId(sessionId)) return { messages: [], componentIds: [] }
    try {
      const raw = await fs.readFile(sessionFile(projectDir, sessionId), 'utf-8')
      const session = JSON.parse(raw) as SessionFile
      return { messages: session.messages, componentIds: session.componentIds }
    } catch {
      return { messages: [], componentIds: [] }
    }
  })

  ipcMain.handle('session:list-for-component', async (_e, {
    projectDir,
    componentId,
  }: {
    projectDir: string
    componentId: string
  }) => {
    try {
      safeComponentId(componentId)
      const sidecar = await readSidecar(projectDir, componentId)
      return { sessionIds: sidecar.sessionIds }
    } catch {
      return { sessionIds: [] }
    }
  })

  ipcMain.handle('component:list-all', async (_e, { projectDir }: { projectDir: string }) => {
    const resolvedProjectDir = projectDir || process.cwd()
    const componentsDir = path.join(resolvedProjectDir, 'components')
    const exists = await fs.access(componentsDir).then(() => true).catch(() => false)
    if (!exists) return { components: [] }

    const onCanvasIds = new Set<string>()
    try {
      const canvasRaw = await fs.readFile(path.join(resolvedProjectDir, 'canvas.json'), 'utf-8')
      const canvas = JSON.parse(canvasRaw) as { components: Array<{ componentId: string }> }
      for (const c of canvas.components ?? []) onCanvasIds.add(c.componentId)
    } catch { /* canvas.json may not exist */ }

    const entries = await fs.readdir(componentsDir, { withFileTypes: true })
    const components: ComponentEntry[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const componentId = entry.name
      const manifestPath = path.join(componentsDir, componentId, 'manifest.json')
      try {
        safeComponentId(componentId)
        const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(manifestRaw)
        const stat = await fs.stat(manifestPath)
        const sidecar = await readSidecar(resolvedProjectDir, componentId)
        components.push({
          componentId,
          manifest,
          lastEditedAt: stat.mtimeMs,
          onCanvas: onCanvasIds.has(componentId),
          sessionIds: sidecar.sessionIds,
        })
      } catch { /* skip corrupted */ }
    }

    components.sort((a, b) => b.lastEditedAt - a.lastEditedAt)
    return { components }
  })

  ipcMain.handle('canvas:add-component', async (_e, {
    projectDir,
    componentId,
  }: {
    projectDir: string
    componentId: string
  }) => {
    const resolvedProjectDir = projectDir || process.cwd()
    try {
      safeComponentId(componentId)
      const componentDir = path.join(resolvedProjectDir, 'components', componentId)
      const bundle = await fs.readFile(path.join(componentDir, 'bundle.js'), 'utf-8')
      const manifestRaw = await fs.readFile(path.join(componentDir, 'manifest.json'), 'utf-8')
      const manifest = JSON.parse(manifestRaw)
      const placement = { x: 2, y: 2, width: 40, height: 30 }

      const canvasPath = path.join(resolvedProjectDir, 'canvas.json')
      let canvas: { components: Array<{ componentId: string; placement: unknown }> } = { components: [] }
      try {
        const raw = await fs.readFile(canvasPath, 'utf-8')
        canvas = JSON.parse(raw)
      } catch { /* no canvas.json yet */ }

      if (!canvas.components.find(c => c.componentId === componentId)) {
        canvas.components.push({ componentId, placement })
        await fs.writeFile(canvasPath, JSON.stringify(canvas, null, 2), 'utf-8')
      }

      return { success: true, componentId, bundle, placement, manifest }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
