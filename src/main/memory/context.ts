import { memoryStore } from './store'

/**
 * Load the user-authored memory files into a single string suitable
 * for injection into an LLM system prompt. Non-fatal on read errors.
 */
export async function loadUserMemory(): Promise<string> {
  try {
    const entries = await memoryStore.list()
    const sections = entries
      .map((e) => {
        const content = e.content.trim()
        if (!content) return null
        return `### ${e.label}\n${content}`
      })
      .filter((s): s is string => s !== null)

    if (sections.length === 0) return ''
    return sections.join('\n\n')
  } catch {
    return ''
  }
}
