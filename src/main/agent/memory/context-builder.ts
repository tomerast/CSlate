import type { MemoryFiles } from './index'

const MAX_CHARS = 3000

interface Section {
  heading: string
  content: string
}

export function buildContextString(memory: MemoryFiles): string {
  const sections: Section[] = [
    { heading: 'User Preferences', content: memory.userPreferences.trim() },
    { heading: 'Project Context', content: memory.projectContext.trim() },
    { heading: 'Component History', content: memory.componentHistory.trim() },
    { heading: 'Feedback Patterns', content: memory.feedbackPatterns.trim() },
  ].filter(s => s.content.length > 0)

  if (sections.length === 0) return ''

  let result = '## Project Memory\n'
  for (const section of sections) {
    const block = `\n### ${section.heading}\n${section.content}\n`
    if (result.length + block.length > MAX_CHARS) {
      const remaining = MAX_CHARS - result.length - `\n### ${section.heading}\n`.length - 20
      if (remaining > 50) {
        result += `\n### ${section.heading}\n${section.content.slice(0, remaining)}…\n`
      }
      break
    }
    result += block
  }
  return result
}
