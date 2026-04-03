// Smart placement solver — positions new components near semantically related ones.

import { checkCollision, findEmptyRect, type Placement, type PlacementWithId } from './collision'

const GUTTER = 2

interface ComponentMeta {
  tags: string[]
  description: string
}

interface ComponentMetaWithId extends ComponentMeta {
  id: string
}

/**
 * Score semantic similarity between two components.
 * - Tag overlap: 2 points per matching tag (case-insensitive)
 * - Description keyword overlap: 0.5 points per shared word (3+ chars, case-insensitive)
 */
export function scoreAffinity(a: ComponentMeta, b: ComponentMeta): number {
  let score = 0

  // Tag overlap
  const aTags = new Set(a.tags.map((t) => t.toLowerCase()))
  for (const tag of b.tags) {
    if (aTags.has(tag.toLowerCase())) {
      score += 2
    }
  }

  // Description keyword overlap
  const toWords = (desc: string) =>
    new Set(
      desc
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    )
  const aWords = toWords(a.description)
  const bWords = toWords(b.description)
  for (const word of bWords) {
    if (aWords.has(word)) {
      score += 0.5
    }
  }

  return score
}

/**
 * Find the best position for a new component on the canvas.
 *
 * Strategy:
 * 1. If no existing components, place at (2, 2).
 * 2. Score affinity against all existing, sort descending.
 * 3. For each anchor (by affinity), try right/below/left/above with GUTTER offset.
 * 4. Pick the first collision-free candidate.
 * 5. If all blocked, fall back to findEmptyRect.
 */
export function solvePlacement(
  newComponent: ComponentMeta,
  size: { width: number; height: number },
  existingPlacements: PlacementWithId[],
  existingManifests: ComponentMetaWithId[],
): { x: number; y: number } {
  if (existingPlacements.length === 0) {
    return { x: GUTTER, y: GUTTER }
  }

  // Score and sort anchors by affinity (descending)
  const scored = existingManifests
    .map((m) => ({
      id: m.id,
      score: scoreAffinity(newComponent, m),
    }))
    .sort((a, b) => b.score - a.score)

  // Build lookup for placements
  const placementById = new Map<string, PlacementWithId>()
  for (const p of existingPlacements) {
    placementById.set(p.id, p)
  }

  // Try candidates around each anchor
  for (const { id } of scored) {
    const anchor = placementById.get(id)
    if (!anchor) continue

    const candidates: Array<{ x: number; y: number }> = [
      // Right
      { x: anchor.x + anchor.width + GUTTER, y: anchor.y },
      // Below
      { x: anchor.x, y: anchor.y + anchor.height + GUTTER },
      // Left
      { x: anchor.x - size.width - GUTTER, y: anchor.y },
      // Above
      { x: anchor.x, y: anchor.y - size.height - GUTTER },
    ]

    for (const candidate of candidates) {
      if (candidate.x < 0 || candidate.y < 0) continue

      const placement: Placement = {
        x: candidate.x,
        y: candidate.y,
        width: size.width,
        height: size.height,
      }

      if (!checkCollision(placement, existingPlacements, GUTTER).collides) {
        return { x: candidate.x, y: candidate.y }
      }
    }
  }

  // Fallback: find any empty rect
  const fallback = findEmptyRect(existingPlacements, size.width, size.height, GUTTER)
  return { x: fallback.x, y: fallback.y }
}
