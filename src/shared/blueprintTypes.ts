import { z } from 'zod'

/**
 * Zod schema for a ComponentBlueprint.
 * Represents a community component entry returned by the server search API
 * and used by the publish flow.
 */
export const ComponentBlueprintSchema = z.object({
  /** Optional UUID assigned by the server */
  id: z.string().uuid().optional(),

  /** Component name (required) */
  name: z.string(),

  /** Component description (required) */
  description: z.string(),

  /** Tags for categorization and search (required) */
  tags: z.array(z.string()),

  /**
   * Source code files (required)
   * Must include 'ui.tsx' as the main component file
   */
  source: z.record(z.string(), z.string()).refine(
    (source) => 'ui.tsx' in source,
    {
      message: "source must include 'ui.tsx'",
    }
  ),

  /** Component author (optional) */
  author: z.string().optional(),

  /** Version string (optional) */
  version: z.string().optional(),

  /** ISO datetime string when component was created (optional) */
  createdAt: z.string().datetime().optional(),

  /** Number of downloads (optional, non-negative) */
  downloads: z.number().int().nonnegative().optional(),

  /** Rating from 0 to 5 (optional) */
  rating: z.number().min(0).max(5).optional(),
})

/**
 * TypeScript type inferred from ComponentBlueprintSchema
 */
export type ComponentBlueprint = z.infer<typeof ComponentBlueprintSchema>

/**
 * Zod schema for search results from the server API.
 * Contains an array of blueprints and the total count.
 */
export const SearchResultSchema = z.object({
  /** Array of component blueprints matching the search query */
  results: z.array(ComponentBlueprintSchema),

  /** Total number of results (non-negative) */
  total: z.number().int().nonnegative(),
})

/**
 * TypeScript type inferred from SearchResultSchema
 */
export type SearchResult = z.infer<typeof SearchResultSchema>
