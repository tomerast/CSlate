import { describe, it, expect } from 'vitest';
import {
  checkCollision,
  clampDragPosition,
  clampResize,
  clampToBounds,
  findEmptyRect,
  type Placement,
  type PlacementWithId,
} from '../collision';

describe('checkCollision', () => {
  const gutter = 20;

  it('returns false for non-overlapping rects', () => {
    const candidate: Placement = { x: 0, y: 0, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 200, y: 200, width: 100, height: 100 },
    ];
    const result = checkCollision(candidate, others, gutter);
    expect(result.collides).toBe(false);
    expect(result.collidingIds).toEqual([]);
  });

  it('returns true for direct overlap', () => {
    const candidate: Placement = { x: 50, y: 50, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
    ];
    const result = checkCollision(candidate, others, gutter);
    expect(result.collides).toBe(true);
    expect(result.collidingIds).toContain('a');
  });

  it('detects gutter violation', () => {
    // Rects don't overlap but gap is less than gutter
    const candidate: Placement = { x: 0, y: 0, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 110, y: 0, width: 100, height: 100 }, // gap of 10, gutter is 20
    ];
    const result = checkCollision(candidate, others, gutter);
    expect(result.collides).toBe(true);
    expect(result.collidingIds).toContain('a');
  });

  it('allows exact gutter distance', () => {
    const candidate: Placement = { x: 0, y: 0, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 120, y: 0, width: 100, height: 100 }, // gap of 20, gutter is 20
    ];
    const result = checkCollision(candidate, others, gutter);
    expect(result.collides).toBe(false);
  });

  it('excludes the specified id', () => {
    const candidate: Placement = { x: 50, y: 50, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'self', x: 50, y: 50, width: 100, height: 100 },
    ];
    const result = checkCollision(candidate, others, gutter, 'self');
    expect(result.collides).toBe(false);
    expect(result.collidingIds).toEqual([]);
  });

  it('reports multiple collisions', () => {
    const candidate: Placement = { x: 50, y: 50, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'b', x: 100, y: 100, width: 100, height: 100 },
    ];
    const result = checkCollision(candidate, others, gutter);
    expect(result.collides).toBe(true);
    expect(result.collidingIds).toContain('a');
    expect(result.collidingIds).toContain('b');
  });
});

describe('clampToBounds', () => {
  it('clamps negative x and y to 0', () => {
    const result = clampToBounds({ x: -10, y: -20, width: 100, height: 100 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('passes valid placement through unchanged', () => {
    const placement: Placement = { x: 50, y: 100, width: 200, height: 150 };
    const result = clampToBounds(placement);
    expect(result).toEqual(placement);
  });
});

describe('clampDragPosition', () => {
  const gutter = 20;

  it('returns candidate when no collision', () => {
    const candidate: Placement = { x: 300, y: 300, width: 100, height: 100 };
    const original: Placement = { x: 0, y: 0, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 500, y: 500, width: 100, height: 100 },
    ];
    const result = clampDragPosition(candidate, others, gutter, 'self', original);
    expect(result.x).toBe(300);
    expect(result.y).toBe(300);
  });

  it('clamps to furthest valid position along drag vector', () => {
    const original: Placement = { x: 0, y: 0, width: 100, height: 100 };
    // Drag right into a component at x=150
    const candidate: Placement = { x: 200, y: 0, width: 100, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 150, y: 0, width: 100, height: 100 },
    ];
    const result = clampDragPosition(candidate, others, gutter, 'self', original);
    // Should be clamped before reaching the collision
    expect(result.x).toBeLessThan(candidate.x);
    // Should still not collide
    const check = checkCollision(result, others, gutter);
    expect(check.collides).toBe(false);
  });

  it('clamps to 0 when dragging into negative', () => {
    const original: Placement = { x: 50, y: 50, width: 100, height: 100 };
    const candidate: Placement = { x: -50, y: -50, width: 100, height: 100 };
    const result = clampDragPosition(candidate, [], gutter, 'self', original);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });
});

describe('clampResize', () => {
  const gutter = 20;

  it('returns candidate when no collision', () => {
    const candidate: Placement = { x: 0, y: 0, width: 200, height: 200 };
    const original: Placement = { x: 0, y: 0, width: 100, height: 100 };
    const others: PlacementWithId[] = [];
    const result = clampResize(candidate, others, gutter, 'self', original);
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
  });

  it('shrinks resize to avoid collision', () => {
    const original: Placement = { x: 0, y: 0, width: 100, height: 100 };
    const candidate: Placement = { x: 0, y: 0, width: 300, height: 100 };
    const others: PlacementWithId[] = [
      { id: 'a', x: 200, y: 0, width: 100, height: 100 },
    ];
    const result = clampResize(candidate, others, gutter, 'self', original);
    expect(result.width).toBeLessThan(candidate.width);
    expect(result.width).toBeGreaterThanOrEqual(original.width);
    const check = checkCollision(result, others, gutter);
    expect(check.collides).toBe(false);
  });
});

describe('findEmptyRect', () => {
  const gutter = 20;

  it('returns origin for empty canvas', () => {
    const result = findEmptyRect([], 200, 150, gutter);
    expect(result.x).toBe(gutter);
    expect(result.y).toBe(gutter);
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it('finds space next to existing component', () => {
    const others: PlacementWithId[] = [
      { id: 'a', x: 20, y: 20, width: 200, height: 150 },
    ];
    const result = findEmptyRect(others, 200, 150, gutter);
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    // Should not collide with existing
    const check = checkCollision(result, others, gutter);
    expect(check.collides).toBe(false);
  });

  it('finds space when canvas has multiple components', () => {
    const others: PlacementWithId[] = [
      { id: 'a', x: 20, y: 20, width: 200, height: 150 },
      { id: 'b', x: 240, y: 20, width: 200, height: 150 },
    ];
    const result = findEmptyRect(others, 200, 150, gutter);
    const check = checkCollision(result, others, gutter);
    expect(check.collides).toBe(false);
  });
});
