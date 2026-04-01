import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const DEFAULT_MAX_CHARS = 50_000

/**
 * Persists content to a temporary file for later retrieval.
 * @param content The full content to persist
 * @param toolName The tool name (used for filename)
 * @returns The absolute path to the persisted file
 */
function persistToTemp(content: string, toolName: string): string {
  const dir = join(tmpdir(), 'cslate-tool-results')
  mkdirSync(dir, { recursive: true })

  const timestamp = Date.now()
  const filename = `${toolName}-${timestamp}.txt`
  const tempPath = join(dir, filename)

  writeFileSync(tempPath, content, 'utf-8')

  return tempPath
}

/**
 * Truncates large tool results to prevent context overflow.
 *
 * @param result The tool result (string, object, or primitive)
 * @param toolName The name of the tool that produced the result
 * @param maxChars Maximum characters allowed (default: 50,000)
 * @returns The budgeted result (truncated if needed)
 */
export function budgetToolResult<T>(
  result: T,
  toolName: string,
  maxChars: number = DEFAULT_MAX_CHARS
): T {
  // Handle null/undefined
  if (result === null || result === undefined) {
    return result
  }

  // Handle strings
  if (typeof result === 'string') {
    if (result.length <= maxChars) {
      return result
    }

    const truncated = result.slice(0, maxChars)
    const tempPath = persistToTemp(result, toolName)
    const message = `\n\n[Truncated — full output (${result.length} chars) saved to: ${tempPath}]`

    return (truncated + message) as T
  }

  // Handle objects
  if (typeof result === 'object') {
    const serialized = JSON.stringify(result)

    if (serialized.length <= maxChars) {
      return result
    }

    // Object is too large - add truncation metadata
    const tempPath = persistToTemp(serialized, toolName)

    return {
      ...result,
      __truncated: true,
      __fullOutputPath: tempPath,
      __originalSize: serialized.length
    } as T
  }

  // Handle primitives (numbers, booleans, etc.)
  return result
}
