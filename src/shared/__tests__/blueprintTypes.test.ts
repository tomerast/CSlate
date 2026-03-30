import { describe, it, expect } from 'vitest'
import {
  ComponentBlueprintSchema,
  SearchResultSchema,
  type ComponentBlueprint,
  type SearchResult,
} from '../blueprintTypes'

describe('ComponentBlueprintSchema', () => {
  it('validates a minimal valid blueprint with only required fields', () => {
    const blueprint = {
      name: 'Test Component',
      description: 'A test component for validation',
      tags: ['test', 'validation'],
      source: {
        'ui.tsx': 'export default function Component() { return <div>Test</div> }',
      },
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Test Component')
      expect(result.data.tags).toEqual(['test', 'validation'])
      expect(result.data.source['ui.tsx']).toBeDefined()
    }
  })

  it('validates a complete blueprint with all optional fields', () => {
    const blueprint = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Full Component',
      description: 'A complete component with all fields',
      tags: ['complete', 'full'],
      source: {
        'ui.tsx': 'export default function Component() { return <div>Full</div> }',
        'styles.css': '.component { color: blue; }',
      },
      author: 'John Doe',
      version: '1.0.0',
      createdAt: '2026-03-30T12:00:00.000Z',
      downloads: 1000,
      rating: 4.5,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(result.data.author).toBe('John Doe')
      expect(result.data.version).toBe('1.0.0')
      expect(result.data.createdAt).toBe('2026-03-30T12:00:00.000Z')
      expect(result.data.downloads).toBe(1000)
      expect(result.data.rating).toBe(4.5)
    }
  })

  it('fails validation when name is missing', () => {
    const blueprint = {
      description: 'Missing name',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation when description is missing', () => {
    const blueprint = {
      name: 'Test',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation when tags are missing', () => {
    const blueprint = {
      name: 'Test',
      description: 'Missing tags',
      source: { 'ui.tsx': 'code' },
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation when source is missing', () => {
    const blueprint = {
      name: 'Test',
      description: 'Missing source',
      tags: ['test'],
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation when source does not include ui.tsx', () => {
    const blueprint = {
      name: 'Test',
      description: 'Missing ui.tsx in source',
      tags: ['test'],
      source: {
        'styles.css': '.component { color: red; }',
      },
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation for invalid UUID', () => {
    const blueprint = {
      id: 'not-a-valid-uuid',
      name: 'Test',
      description: 'Invalid UUID',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation for negative downloads', () => {
    const blueprint = {
      name: 'Test',
      description: 'Negative downloads',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      downloads: -10,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation for rating below 0', () => {
    const blueprint = {
      name: 'Test',
      description: 'Invalid rating',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      rating: -1,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('fails validation for rating above 5', () => {
    const blueprint = {
      name: 'Test',
      description: 'Invalid rating',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      rating: 6,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })

  it('validates rating at boundary 0', () => {
    const blueprint = {
      name: 'Test',
      description: 'Rating at 0',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      rating: 0,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(true)
  })

  it('validates rating at boundary 5', () => {
    const blueprint = {
      name: 'Test',
      description: 'Rating at 5',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      rating: 5,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(true)
  })

  it('validates downloads at 0', () => {
    const blueprint = {
      name: 'Test',
      description: 'Zero downloads',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      downloads: 0,
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(true)
  })

  it('fails validation for invalid ISO datetime string', () => {
    const blueprint = {
      name: 'Test',
      description: 'Invalid datetime',
      tags: ['test'],
      source: { 'ui.tsx': 'code' },
      createdAt: 'not-a-valid-datetime',
    }

    const result = ComponentBlueprintSchema.safeParse(blueprint)
    expect(result.success).toBe(false)
  })
})

describe('SearchResultSchema', () => {
  it('validates empty search results', () => {
    const searchResult = {
      results: [],
      total: 0,
    }

    const result = SearchResultSchema.safeParse(searchResult)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.results).toEqual([])
      expect(result.data.total).toBe(0)
    }
  })

  it('validates search results with multiple blueprints', () => {
    const searchResult = {
      results: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Component 1',
          description: 'First component',
          tags: ['first'],
          source: { 'ui.tsx': 'code1' },
        },
        {
          name: 'Component 2',
          description: 'Second component',
          tags: ['second'],
          source: { 'ui.tsx': 'code2' },
        },
      ],
      total: 2,
    }

    const result = SearchResultSchema.safeParse(searchResult)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.results).toHaveLength(2)
      expect(result.data.total).toBe(2)
    }
  })

  it('fails validation when results is missing', () => {
    const searchResult = {
      total: 0,
    }

    const result = SearchResultSchema.safeParse(searchResult)
    expect(result.success).toBe(false)
  })

  it('fails validation when total is missing', () => {
    const searchResult = {
      results: [],
    }

    const result = SearchResultSchema.safeParse(searchResult)
    expect(result.success).toBe(false)
  })

  it('fails validation for negative total', () => {
    const searchResult = {
      results: [],
      total: -1,
    }

    const result = SearchResultSchema.safeParse(searchResult)
    expect(result.success).toBe(false)
  })

  it('fails validation when results contains invalid blueprint', () => {
    const searchResult = {
      results: [
        {
          name: 'Missing required fields',
          // missing description, tags, source
        },
      ],
      total: 1,
    }

    const result = SearchResultSchema.safeParse(searchResult)
    expect(result.success).toBe(false)
  })
})

describe('TypeScript types', () => {
  it('exports ComponentBlueprint type', () => {
    const blueprint: ComponentBlueprint = {
      name: 'Typed Component',
      description: 'A typed component',
      tags: ['typed'],
      source: { 'ui.tsx': 'code' },
    }

    expect(blueprint.name).toBe('Typed Component')
  })

  it('exports SearchResult type', () => {
    const searchResult: SearchResult = {
      results: [],
      total: 0,
    }

    expect(searchResult.total).toBe(0)
  })
})
