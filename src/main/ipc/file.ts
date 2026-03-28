import { promises as fs } from 'fs'
import path from 'path'
import type { IpcMain } from 'electron'
import { safePath } from '../lib/paths'

export async function readFile(projectDir: string, relativePath: string): Promise<string> {
  const target = safePath(projectDir, relativePath)
  return fs.readFile(target, 'utf-8')
}

export async function writeFile(projectDir: string, relativePath: string, content: string): Promise<void> {
  const target = safePath(projectDir, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content, 'utf-8')
}

export async function fileExists(projectDir: string, relativePath: string): Promise<boolean> {
  const target = safePath(projectDir, relativePath)
  return fs.access(target).then(() => true).catch(() => false)
}

export async function deleteFile(projectDir: string, relativePath: string): Promise<void> {
  const target = safePath(projectDir, relativePath)
  await fs.unlink(target)
}

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('file:read', (_e, args: { projectDir: string; relativePath: string }) =>
    readFile(args.projectDir, args.relativePath))
  ipcMain.handle('file:write', (_e, args: { projectDir: string; relativePath: string; content: string }) =>
    writeFile(args.projectDir, args.relativePath, args.content))
  ipcMain.handle('file:exists', (_e, args: { projectDir: string; relativePath: string }) =>
    fileExists(args.projectDir, args.relativePath))
  ipcMain.handle('file:delete', (_e, args: { projectDir: string; relativePath: string }) =>
    deleteFile(args.projectDir, args.relativePath))
}
