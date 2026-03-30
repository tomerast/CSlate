import { z } from 'zod'

export const ComponentBlueprintSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  source: z.record(z.string(), z.string()).refine(
    (source) => 'ui.tsx' in source,
    { message: "source must include 'ui.tsx'" }
  ),
  author: z.string().optional(),
  version: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  downloads: z.number().int().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
})

export type ComponentBlueprint = z.infer<typeof ComponentBlueprintSchema>

export const SearchResultSchema = z.object({
  results: z.array(ComponentBlueprintSchema),
  total: z.number().int().nonnegative(),
})

export type SearchResult = z.infer<typeof SearchResultSchema>
