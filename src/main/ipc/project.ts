import { promises as fs } from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import type { ComponentPackage, ComponentManifest } from '@cslate/shared'
import { safePath, safeComponentId } from '../lib/paths'
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

function addToRecents(projectDir: string, name: string): void {
  const entry: RecentProject = {
    path: projectDir,
    name,
    lastOpened: new Date().toISOString(),
  }
  const current = (configStore.get('recentProjects') as string[] | undefined) ?? []
  const deduped = current.filter((p: string) => p !== projectDir)
  const updated = [projectDir, ...deduped].slice(0, MAX_RECENTS)
  configStore.set('recentProjects', updated)
  // Store project names alongside paths
  const names = configStore.get('_recentProjectNames' as any) as Record<string, string> ?? {}
  names[projectDir] = name
  configStore.set('_recentProjectNames' as any, names)
}

export function listRecentProjects(): RecentProject[] {
  const paths = (configStore.get('recentProjects') as string[] | undefined) ?? []
  const names = configStore.get('_recentProjectNames' as any) as Record<string, string> ?? {}
  return paths.map(p => ({
    path: p,
    name: names[p] ?? path.basename(p),
    lastOpened: new Date().toISOString(),
  }))
}

export async function createProject(projectDir: string, name: string): Promise<AppManifest> {
  const manifest: AppManifest = {
    name,
    version: '0.1.0',
    createdAt: new Date().toISOString(),
    settings: { defaultTheme: 'dark', autoCheckpoint: true },
  }
  await fs.mkdir(path.join(projectDir, 'tabs'), { recursive: true })
  await fs.mkdir(path.join(projectDir, 'components'), { recursive: true })
  await fs.mkdir(path.join(projectDir, '.cslate'), { recursive: true })
  await fs.writeFile(path.join(projectDir, 'cslate.json'), JSON.stringify(manifest, null, 2), 'utf-8')
  addToRecents(projectDir, name)
  return manifest
}

export async function openProject(projectDir: string): Promise<AppManifest> {
  const cslateJson = path.join(projectDir, 'cslate.json')
  const raw = await fs.readFile(cslateJson, 'utf-8')
  const manifest = JSON.parse(raw) as AppManifest
  addToRecents(projectDir, manifest.name)
  return manifest
}

export async function saveProject(projectDir: string, manifest: AppManifest): Promise<void> {
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
    const filePath = path.join(componentDir, entry.path)
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    if (exists) {
      files[entry.path] = await fs.readFile(filePath, 'utf-8')
    }
  }
  return { manifest, files }
}

export async function writeComponent(projectDir: string, componentId: string, pkg: ComponentPackage): Promise<void> {
  safeComponentId(componentId)
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
}
