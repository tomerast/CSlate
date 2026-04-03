// AABB collision system — pure functions, no side effects.
// Used by drag, resize, auto-size, and placement logic.

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacementWithId extends Placement {
  id: string;
}

export interface CollisionResult {
  collides: boolean;
  collidingIds: string[];
}

/**
 * AABB intersection check with gutter.
 * Two rects collide if the gap between them is less than `gutter`.
 */
export function checkCollision(
  candidate: Placement,
  others: PlacementWithId[],
  gutter: number,
  excludeId?: string,
): CollisionResult {
  const collidingIds: string[] = [];

  for (const other of others) {
    if (excludeId && other.id === excludeId) continue;

    const gapX = Math.max(
      other.x - (candidate.x + candidate.width),
      candidate.x - (other.x + other.width),
    );
    const gapY = Math.max(
      other.y - (candidate.y + candidate.height),
      candidate.y - (other.y + other.height),
    );

    // If gap in either axis is >= gutter, no collision
    // If gap is negative, rects overlap on that axis
    // Collision occurs when gap < gutter on BOTH axes
    if (gapX < gutter && gapY < gutter) {
      collidingIds.push(other.id);
    }
  }

  return { collides: collidingIds.length > 0, collidingIds };
}

/**
 * Clamp x, y to >= 0 (canvas bounds).
 */
export function clampToBounds(placement: Placement): Placement {
  return {
    ...placement,
    x: Math.max(0, placement.x),
    y: Math.max(0, placement.y),
  };
}

/**
 * Binary search along the drag vector from `original` to `candidate`
 * to find the furthest valid (non-colliding) position.
 */
export function clampDragPosition(
  candidate: Placement,
  others: PlacementWithId[],
  gutter: number,
  excludeId: string,
  original: Placement,
): Placement {
  // First clamp to bounds
  const clamped = clampToBounds(candidate);

  // Check if the clamped position is collision-free
  if (!checkCollision(clamped, others, gutter, excludeId).collides) {
    return clamped;
  }

  // Binary search along the vector from original to candidate
  let lo = 0; // original
  let hi = 1; // candidate
  const dx = clamped.x - original.x;
  const dy = clamped.y - original.y;

  const ITERATIONS = 20;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const test: Placement = {
      x: original.x + dx * mid,
      y: original.y + dy * mid,
      width: clamped.width,
      height: clamped.height,
    };
    const bounded = clampToBounds(test);
    if (checkCollision(bounded, others, gutter, excludeId).collides) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return clampToBounds({
    x: Math.round(original.x + dx * lo),
    y: Math.round(original.y + dy * lo),
    width: clamped.width,
    height: clamped.height,
  });
}

/**
 * Binary search to shrink resize delta until no collision.
 * Interpolates x, y, width, height between original and candidate so that
 * N/W/NW handle resizes (which shift position) are correctly handled.
 */
export function clampResize(
  candidate: Placement,
  others: PlacementWithId[],
  gutter: number,
  excludeId: string,
  original: Placement,
): Placement {
  if (!checkCollision(candidate, others, gutter, excludeId).collides) {
    return candidate;
  }

  let lo = 0; // original
  let hi = 1; // candidate
  const dx = candidate.x - original.x;
  const dy = candidate.y - original.y;
  const dw = candidate.width - original.width;
  const dh = candidate.height - original.height;

  const ITERATIONS = 20;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const test: Placement = {
      x: original.x + dx * mid,
      y: original.y + dy * mid,
      width: original.width + dw * mid,
      height: original.height + dh * mid,
    };
    if (checkCollision(test, others, gutter, excludeId).collides) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return {
    x: Math.round(original.x + dx * lo),
    y: Math.round(original.y + dy * lo),
    width: Math.round(original.width + dw * lo),
    height: Math.round(original.height + dh * lo),
  };
}

/**
 * Find an empty rectangle on the canvas.
 * Strategy: try to the right of each existing component, then below each,
 * then fall back to below everything.
 */
export function findEmptyRect(
  others: PlacementWithId[],
  width: number,
  height: number,
  gutter: number,
): Placement {
  // Empty canvas — place at gutter offset from origin
  if (others.length === 0) {
    return { x: gutter, y: gutter, width, height };
  }

  // Try to the right of each existing component
  for (const other of others) {
    const candidate: Placement = {
      x: other.x + other.width + gutter,
      y: other.y,
      width,
      height,
    };
    if (!checkCollision(candidate, others, gutter).collides) {
      return candidate;
    }
  }

  // Try below each existing component
  for (const other of others) {
    const candidate: Placement = {
      x: other.x,
      y: other.y + other.height + gutter,
      width,
      height,
    };
    if (!checkCollision(candidate, others, gutter).collides) {
      return candidate;
    }
  }

  // Fall back: below everything
  let maxBottom = 0;
  for (const other of others) {
    maxBottom = Math.max(maxBottom, other.y + other.height);
  }
  return { x: gutter, y: maxBottom + gutter, width, height };
}
