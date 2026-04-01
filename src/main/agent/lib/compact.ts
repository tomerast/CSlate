/**
 * Context compaction utility
 * Summarizes old conversation turns when approaching context limits
 */

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Constants
const CHARS_PER_TOKEN = 4
const COMPACT_THRESHOLD = 0.8
const MIN_MESSAGES_TO_COMPACT = 4
const PRESERVED_TAIL_COUNT = 4
const DEFAULT_CONTEXT_WINDOW = 200_000

/**
 * Estimates token count based on character count
 * Uses rough heuristic: ~4 chars per token
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Determines if conversation should be compacted
 * Returns true when:
 * - Estimated tokens > 80% of context window
 * - AND messages.length >= 4
 */
export function shouldCompact(
  messages: ConversationMessage[],
  contextWindowTokens: number = DEFAULT_CONTEXT_WINDOW
): boolean {
  // Never compact fewer than MIN_MESSAGES_TO_COMPACT messages
  if (messages.length < MIN_MESSAGES_TO_COMPACT) {
    return false
  }

  // Calculate total estimated tokens
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
  const estimatedTokens = estimateTokens(totalChars.toString()) // Convert to string for estimateTokens

  // Actually, we should estimate directly from total chars
  const totalEstimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN)

  const threshold = contextWindowTokens * COMPACT_THRESHOLD

  return totalEstimatedTokens > threshold
}

/**
 * Builds a compact summary of older messages
 * Preserves last N messages, summarizes the rest
 */
export function buildCompactSummary(
  messages: ConversationMessage[],
  preserveCount: number = PRESERVED_TAIL_COUNT
): { summary: string; preserved: ConversationMessage[] } {
  // Split messages into old (to summarize) and recent (to preserve)
  const splitIndex = Math.max(0, messages.length - preserveCount)
  const toSummarize = messages.slice(0, splitIndex)
  const preserved = messages.slice(splitIndex)

  // Build summary from older messages
  const summaryParts: string[] = []

  for (const msg of toSummarize) {
    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
    // Extract key points from content (first 100 chars as a simple heuristic)
    const preview = msg.content.length > 100
      ? msg.content.slice(0, 100) + '...'
      : msg.content
    summaryParts.push(`${roleLabel}: ${preview}`)
  }

  const summary = summaryParts.length > 0
    ? `[Earlier conversation summary]\n${summaryParts.join('\n')}`
    : '[No earlier messages]'

  return { summary, preserved }
}

/**
 * Main entry point for auto-compaction
 * Returns original messages if under threshold, otherwise returns compacted version
 */
export function autoCompactIfNeeded(
  messages: ConversationMessage[],
  contextWindowTokens: number = DEFAULT_CONTEXT_WINDOW
): ConversationMessage[] {
  // Check if compaction is needed
  if (!shouldCompact(messages, contextWindowTokens)) {
    return messages
  }

  // Build compact summary
  const { summary, preserved } = buildCompactSummary(messages)

  // Return system message with summary + preserved messages
  const systemMessage: ConversationMessage = {
    role: 'system',
    content: summary
  }

  return [systemMessage, ...preserved]
}
