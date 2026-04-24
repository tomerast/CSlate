import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Chat-portal memory layout. Memory is global to the user, not
 * per-project. Files live in ~/.cslate/memory/ and are plain markdown so
 * users can edit them directly.
 */
export interface MemoryFile {
  name: string
  label: string
  description: string
  defaultContent: string
}

export const MEMORY_FILES: MemoryFile[] = [
  {
    name: 'user_preferences.md',
    label: 'User Preferences',
    description:
      'How you like answers to look. Density, tone, units, favorite frameworks, color palettes, dashboard style.',
    defaultContent:
      '# User Preferences\n\n<!-- Describe how you prefer answers and UI cards. The assistant reads this every turn. -->\n\n- Tone:\n- Density:\n- Units:\n- Visual style:\n',
  },
  {
    name: 'domain_context.md',
    label: 'Domain Context',
    description:
      'What you work on. The assistant uses this to pick relevant vocabulary, charts, and data sources.',
    defaultContent:
      '# Domain Context\n\n<!-- The subject matter, data sources, and tools you care about. -->\n\n- Field of work:\n- Tools I use:\n- Data sources I trust:\n',
  },
  {
    name: 'component_history.md',
    label: 'Component History',
    description:
      'Auto-populated as the assistant generates cards. You can edit, annotate, or clear it.',
    defaultContent: '# Component History\n',
  },
]

export interface MemoryEntry {
  name: string
  label: string
  description: string
  size: number
  updatedAt: number
  content: string
}

function memoryDir(): string {
  return join(app.getPath('home'), '.cslate', 'memory')
}

async function ensureDir(): Promise<string> {
  const dir = memoryDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function findMeta(name: string): MemoryFile | undefined {
  return MEMORY_FILES.find((f) => f.name === name)
}

async function readOrSeed(meta: MemoryFile): Promise<MemoryEntry> {
  const dir = await ensureDir()
  const filePath = join(dir, meta.name)
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath),
    ])
    return {
      name: meta.name,
      label: meta.label,
      description: meta.description,
      size: stat.size,
      updatedAt: stat.mtimeMs,
      content,
    }
  } catch {
    // Seed on first read so the user sees a starting template
    await fs.writeFile(filePath, meta.defaultContent, 'utf-8')
    const stat = await fs.stat(filePath)
    return {
      name: meta.name,
      label: meta.label,
      description: meta.description,
      size: stat.size,
      updatedAt: stat.mtimeMs,
      content: meta.defaultContent,
    }
  }
}

export const memoryStore = {
  async list(): Promise<MemoryEntry[]> {
    return Promise.all(MEMORY_FILES.map(readOrSeed))
  },

  async read(name: string): Promise<MemoryEntry | null> {
    const meta = findMeta(name)
    if (!meta) return null
    return readOrSeed(meta)
  },

  async write(name: string, content: string): Promise<MemoryEntry | null> {
    const meta = findMeta(name)
    if (!meta) return null
    const dir = await ensureDir()
    await fs.writeFile(join(dir, meta.name), content, 'utf-8')
    return readOrSeed(meta)
  },
}
