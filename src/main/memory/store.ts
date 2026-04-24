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
      '# User Preferences\n\n<!-- Describe how you prefer answers and UI cards. The assistant reads this every turn. -->\n\n- Tone:\n- Density:\n- Units:\n- Visual style:\n\n## Auto-Learned UI Preferences\n\n<!-- CSlate adds durable UI/card preferences here when you state them in chat. Edit or delete freely. -->\n',
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

const AUTO_UI_HEADING = '## Auto-Learned UI Preferences'
const AUTO_UI_NOTE =
  '<!-- CSlate adds durable UI/card preferences here when you state them in chat. Edit or delete freely. -->'
const MAX_AUTO_UI_PREFERENCES = 30

function normalizePreference(line: string): string {
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalPreference(line: string): string {
  return normalizePreference(line)
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
}

function formatPreference(text: string): string {
  const normalized = normalizePreference(text)
  return normalized ? `- ${normalized}` : ''
}

export function mergeAutoUiPreferences(content: string, preferences: string[]): string {
  const incoming = preferences
    .map(formatPreference)
    .filter(Boolean)

  if (incoming.length === 0) return content

  const headingIndex = content.indexOf(AUTO_UI_HEADING)
  const beforeSection =
    headingIndex >= 0 ? content.slice(0, headingIndex).trimEnd() : content.trimEnd()
  const section =
    headingIndex >= 0 ? content.slice(headingIndex) : `${AUTO_UI_HEADING}\n\n${AUTO_UI_NOTE}\n`
  const nextHeadingMatch = section.slice(AUTO_UI_HEADING.length).match(/\n##\s+/)
  const sectionEnd = nextHeadingMatch
    ? AUTO_UI_HEADING.length + nextHeadingMatch.index! + 1
    : section.length
  const autoSection = section.slice(0, sectionEnd)
  const afterSection = section.slice(sectionEnd).trimStart()

  const existing = autoSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))

  const seen = new Set(existing.map(canonicalPreference))
  const additions = incoming.filter((line) => {
    const key = canonicalPreference(line)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (additions.length === 0) return content

  const merged = [...existing, ...additions].slice(-MAX_AUTO_UI_PREFERENCES)
  const rebuiltSection = `${AUTO_UI_HEADING}\n\n${AUTO_UI_NOTE}\n${merged.join('\n')}\n`
  const rebuilt = `${beforeSection}\n\n${rebuiltSection}${afterSection ? `\n${afterSection}` : ''}`
  return `${rebuilt.trimEnd()}\n`
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

  async addAutoUiPreferences(preferences: string[]): Promise<MemoryEntry | null> {
    const current = await this.read('user_preferences.md')
    if (!current) return null
    const next = mergeAutoUiPreferences(current.content, preferences)
    if (next === current.content) return current
    return this.write('user_preferences.md', next)
  },
}
