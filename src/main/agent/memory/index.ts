import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export interface MemoryFiles {
  userPreferences: string
  projectContext: string
  componentHistory: string
  feedbackPatterns: string
}

const FILE_MAP: Record<keyof MemoryFiles, string> = {
  userPreferences: 'user_preferences.md',
  projectContext: 'project_context.md',
  componentHistory: 'component_history.md',
  feedbackPatterns: 'feedback_patterns.md',
}

function memoryDir(projectDir: string): string {
  return join(projectDir, 'agent', 'memory')
}

export async function initMemory(projectDir: string): Promise<void> {
  const dir = memoryDir(projectDir)
  await mkdir(dir, { recursive: true })
  const indexPath = join(dir, 'MEMORY.md')
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '# Agent Memory\n\n- [User Preferences](user_preferences.md)\n- [Project Context](project_context.md)\n- [Component History](component_history.md)\n- [Feedback Patterns](feedback_patterns.md)\n')
  }
}

export async function readMemory(projectDir: string): Promise<MemoryFiles> {
  const dir = memoryDir(projectDir)
  const result: MemoryFiles = { userPreferences: '', projectContext: '', componentHistory: '', feedbackPatterns: '' }
  if (!existsSync(dir)) return result

  for (const [key, filename] of Object.entries(FILE_MAP) as [keyof MemoryFiles, string][]) {
    const filePath = join(dir, filename)
    if (existsSync(filePath)) {
      result[key] = await readFile(filePath, 'utf-8')
    }
  }
  return result
}

export async function writeMemoryEntry(
  projectDir: string,
  key: keyof MemoryFiles,
  content: string,
  mode: 'append' | 'overwrite' = 'append'
): Promise<void> {
  await initMemory(projectDir)
  const filePath = join(memoryDir(projectDir), FILE_MAP[key])
  if (mode === 'overwrite') {
    await writeFile(filePath, content, 'utf-8')
  } else {
    const existing = existsSync(filePath) ? await readFile(filePath, 'utf-8') : ''
    await writeFile(filePath, existing ? `${existing}\n${content}` : content, 'utf-8')
  }
}
