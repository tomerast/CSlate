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

export const BreakpointSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
})
export type Breakpoint = z.infer<typeof BreakpointSchema>

export const ComponentLayoutSchema = z.object({
  minWidth: z.number().positive().default(10),
  minHeight: z.number().positive().default(6),
  maxWidth: z.number().positive().optional(),
  maxHeight: z.number().positive().optional(),
  preferredAspectRatio: z.number().positive().optional(),
  breakpoints: z.array(BreakpointSchema).optional(),
  autoSize: z.boolean().default(true),
})
export type ComponentLayout = z.infer<typeof ComponentLayoutSchema>
