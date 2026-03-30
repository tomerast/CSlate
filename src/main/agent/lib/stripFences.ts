/**
 * Strip markdown code fences from LLM output.
 * Handles ```jsx, ```tsx, ```typescript, ```javascript, ```ts, ```js, and bare ``` fences.
 *
 * @param code - The code string potentially wrapped in markdown fences
 * @returns The code with fences removed, or unchanged if no fences present
 */
export function stripFences(code: string): string {
  // Match opening fence with optional language identifier
  // Matches: ```jsx, ```tsx, ```typescript, ```javascript, ```ts, ```js, or bare ```
  const fencePattern = /^```(?:jsx|tsx|typescript|javascript|ts|js)?\n([\s\S]*?)\n```$/

  const match = code.match(fencePattern)
  if (match) {
    return match[1]
  }

  // Return unchanged if no fences detected
  return code
}
