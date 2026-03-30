/**
 * Strip markdown code fences from LLM output.
 * Handles ```jsx, ```tsx, ```typescript, ```javascript, ```ts, ```js, and bare ``` fences.
 */
export function stripFences(code: string): string {
  const trimmed = code.trim()
  const match = trimmed.match(/^```(?:jsx|tsx|typescript|javascript|ts|js)?\s*\n([\s\S]*?)\n```\s*$/)
  return match ? match[1] : code
}
