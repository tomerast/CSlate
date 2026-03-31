import { app } from 'electron'
import path from 'path'

export function safePath(projectDir: string, relativePath: string): string {
  const base = path.resolve(projectDir)
  const resolved = path.resolve(projectDir, relativePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal attempt blocked: ${relativePath}`)
  }
  return resolved
}

const RESERVED_COMPONENT_IDS = new Set(['node_modules', '.cslate', 'tabs', 'versions'])

export function safeComponentId(componentId: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(componentId)) {
    throw new Error(`Invalid componentId: "${componentId}" — must be lowercase alphanumeric with hyphens or underscores`)
  }
  if (RESERVED_COMPONENT_IDS.has(componentId)) {
    throw new Error(`Reserved componentId: "${componentId}"`)
  }
  return componentId
}

export function getUserDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments)
}
