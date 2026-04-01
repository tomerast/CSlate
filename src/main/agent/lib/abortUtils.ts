/**
 * Creates a child AbortController that propagates abort signals from its parent.
 *
 * - When parent aborts, child aborts with the parent's reason
 * - Child can abort independently without affecting parent
 * - If parent is already aborted, child starts aborted
 */
export function createChildAbortController(parent: AbortController): AbortController {
  const child = new AbortController()

  // If parent is already aborted, abort the child immediately with the same reason
  if (parent.signal.aborted) {
    child.abort(parent.signal.reason)
    return child
  }

  // Listen for parent abort and propagate to child
  parent.signal.addEventListener('abort', () => {
    child.abort(parent.signal.reason)
  })

  return child
}
