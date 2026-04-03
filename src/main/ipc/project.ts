import { promises as fs } from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import type { ComponentPackage, ComponentManifest } from '@cslate/shared'
import { safePath, safeComponentId } from '../lib/paths'
import { updateCanvasJson, removeFromCanvasJson } from '../agent/lib/canvasJson'
import { configStore } from '../lib/store'

export interface AppManifest {
  name: string
  version: string
  createdAt: string
  settings: {
    defaultTheme: string
    autoCheckpoint: boolean
  }
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

const MAX_RECENTS = 10

function isRecentProject(r: unknown): r is RecentProject {
  return typeof r === 'object' && r !== null &&
    typeof (r as RecentProject).path === 'string' &&
    typeof (r as RecentProject).name === 'string' &&
    typeof (r as RecentProject).lastOpened === 'string'
}

function parseAppManifest(raw: string): AppManifest {
  const data = JSON.parse(raw) as Partial<AppManifest>
  if (!data.name || !data.version || !data.createdAt || !data.settings) {
    throw new Error('Invalid cslate.json: missing required fields')
  }
  return data as AppManifest
}

function addToRecents(projectDir: string, name: string): void {
  const entry: RecentProject = {
    path: projectDir,
    name,
    lastOpened: new Date().toISOString(),
  }
  const raw = (configStore.get('recentProjects') as unknown[] | undefined) ?? []
  const current = raw.filter(isRecentProject)
  const deduped = current.filter((r) => r.path !== projectDir)
  const updated = [entry, ...deduped].slice(0, MAX_RECENTS)
  configStore.set('recentProjects', updated)
}

export function listRecentProjects(): RecentProject[] {
  const raw = (configStore.get('recentProjects') as unknown[] | undefined) ?? []
  return raw.filter(isRecentProject)
}

export async function createProject(projectDir: string, name: string): Promise<AppManifest> {
  if (!path.isAbsolute(projectDir)) {
    throw new Error(`projectDir must be an absolute path: "${projectDir}"`)
  }
  const manifest: AppManifest = {
    name,
    version: '0.1.0',
    createdAt: new Date().toISOString(),
    settings: { defaultTheme: 'dark', autoCheckpoint: true },
  }
  await fs.mkdir(path.join(projectDir, 'tabs'), { recursive: true })
  await fs.mkdir(path.join(projectDir, 'components'), { recursive: true })
  await fs.mkdir(path.join(projectDir, '.cslate'), { recursive: true })
  await fs.writeFile(safePath(projectDir, 'cslate.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  addToRecents(projectDir, name)
  return manifest
}

export async function openProject(projectDir: string): Promise<AppManifest> {
  if (!path.isAbsolute(projectDir)) {
    throw new Error(`projectDir must be an absolute path: "${projectDir}"`)
  }
  const cslateJson = safePath(projectDir, 'cslate.json')
  const raw = await fs.readFile(cslateJson, 'utf-8')
  const manifest = parseAppManifest(raw)
  addToRecents(projectDir, manifest.name)
  return manifest
}

export async function saveProject(projectDir: string, manifest: AppManifest): Promise<void> {
  if (!path.isAbsolute(projectDir)) {
    throw new Error(`projectDir must be an absolute path: "${projectDir}"`)
  }
  const cslateJson = safePath(projectDir, 'cslate.json')
  await fs.writeFile(cslateJson, JSON.stringify(manifest, null, 2), 'utf-8')
}

export async function readComponent(projectDir: string, componentId: string): Promise<ComponentPackage> {
  safeComponentId(componentId)
  const componentDir = path.join(projectDir, 'components', componentId)
  const manifestRaw = await fs.readFile(path.join(componentDir, 'manifest.json'), 'utf-8')
  const manifest = JSON.parse(manifestRaw) as ComponentManifest
  const files: Record<string, string> = {}
  for (const entry of manifest.files) {
    const filePath = safePath(componentDir, entry.path)
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    if (exists) {
      files[entry.path] = await fs.readFile(filePath, 'utf-8')
    }
  }
  return { manifest, files }
}

export async function writeComponent(projectDir: string, componentId: string, pkg: ComponentPackage): Promise<void> {
  safeComponentId(componentId)
  // Validate all pkg.files keys are listed in manifest.files
  const manifestFilePaths = new Set(pkg.manifest.files.map(f => f.path))
  const missingFromManifest = Object.keys(pkg.files).filter(k => !manifestFilePaths.has(k))
  if (missingFromManifest.length > 0) {
    throw new Error(`ComponentPackage.files has keys not listed in manifest.files: ${missingFromManifest.join(', ')}`)
  }
  const componentDir = path.join(projectDir, 'components', componentId)
  await fs.mkdir(componentDir, { recursive: true })
  await fs.writeFile(path.join(componentDir, 'manifest.json'), JSON.stringify(pkg.manifest, null, 2), 'utf-8')
  for (const [filePath, content] of Object.entries(pkg.files)) {
    const target = safePath(componentDir, filePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf-8')
  }
}

export async function listComponents(projectDir: string): Promise<ComponentManifest[]> {
  const componentsDir = path.join(projectDir, 'components')
  const exists = await fs.access(componentsDir).then(() => true).catch(() => false)
  if (!exists) return []
  const entries = await fs.readdir(componentsDir, { withFileTypes: true })
  const manifests: ComponentManifest[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(componentsDir, entry.name, 'manifest.json')
    const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false)
    if (!manifestExists) continue
    const raw = await fs.readFile(manifestPath, 'utf-8')
    manifests.push(JSON.parse(raw) as ComponentManifest)
  }
  return manifests
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('project:open', (_e, args: { projectDir: string }) =>
    openProject(args.projectDir))
  ipcMain.handle('project:save', (_e, args: { projectDir: string; manifest: AppManifest }) =>
    saveProject(args.projectDir, args.manifest))
  ipcMain.handle('project:create', (_e, args: { projectDir: string; name: string }) =>
    createProject(args.projectDir, args.name))
  ipcMain.handle('project:list-recent', () =>
    listRecentProjects())
  ipcMain.handle('component:read', (_e, args: { projectDir: string; componentId: string }) =>
    readComponent(args.projectDir, args.componentId))
  ipcMain.handle('component:write', (_e, args: { projectDir: string; componentId: string; pkg: ComponentPackage }) =>
    writeComponent(args.projectDir, args.componentId, args.pkg))
  ipcMain.handle('component:list', (_e, args: { projectDir: string }) =>
    listComponents(args.projectDir))
  ipcMain.handle('canvas:load', async (_e, args: { projectDir: string }) => {
    if (!args.projectDir) return { components: [] }
    const canvasPath = path.join(args.projectDir, 'canvas.json')
    let canvas: { components: Array<{ componentId: string; placement: { x: number; y: number; width: number; height: number } }> }
    try {
      const raw = await fs.readFile(canvasPath, 'utf-8')
      canvas = JSON.parse(raw)
    } catch {
      return { components: [] }
    }

    const components: Array<{
      componentId: string
      bundle: string
      placement: { x: number; y: number; width: number; height: number }
      manifest: unknown
    }> = []

    for (const entry of (canvas.components ?? [])) {
      try { safeComponentId(entry.componentId) } catch { continue }
      const componentDir = path.join(args.projectDir, 'components', entry.componentId)
      try {
        const bundle = await fs.readFile(path.join(componentDir, 'bundle.js'), 'utf-8')
        const manifestRaw = await fs.readFile(path.join(componentDir, 'manifest.json'), 'utf-8')
        const manifest = JSON.parse(manifestRaw)
        components.push({
          componentId: entry.componentId,
          bundle,
          placement: entry.placement,
          manifest,
        })
      } catch {
        continue // Skip corrupted/missing components
      }
    }

    return { components }
  })
  ipcMain.handle('canvas:update-placement', async (_e, args: {
    componentId: string
    placement: { x: number; y: number; width: number; height: number }
  }) => {
    const projectDir = configStore.get('projectDir') as string
    if (!projectDir) throw new Error('No project open')
    safeComponentId(args.componentId)
    await updateCanvasJson(projectDir, args.componentId, args.placement)
    return { success: true }
  })
  ipcMain.handle('canvas:remove-component', async (_e, args: {
    componentId: string
    deleteFiles?: boolean
  }) => {
    const projectDir = configStore.get('projectDir') as string
    if (!projectDir) throw new Error('No project open')
    try { safeComponentId(args.componentId) } catch { return { success: false, error: 'Invalid componentId' } }
    await removeFromCanvasJson(projectDir, args.componentId)
    if (args.deleteFiles) {
      const componentDir = path.join(projectDir, 'components', args.componentId)
      await fs.rm(componentDir, { recursive: true, force: true })
    }
    return { success: true }
  })
}
