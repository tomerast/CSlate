import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'

export const PlacementSchema = z.object({
  x: z.number().describe('Grid units from left'),
  y: z.number().describe('Grid units from top'),
  width: z.number().describe('Width in grid units (1 unit = 8px)'),
  height: z.number().describe('Height in grid units'),
})

export type Placement = z.infer<typeof PlacementSchema>

export interface CanvasEntry {
  componentId: string
  placement: Placement
}

export interface CanvasJson {
  components: CanvasEntry[]
}

export async function readCanvasJson(projectDir: string): Promise<CanvasJson> {
  try {
    const raw = await readFile(join(projectDir, 'canvas.json'), 'utf-8')
    return JSON.parse(raw) as CanvasJson
  } catch {
    return { components: [] }
  }
}

export async function updateCanvasJson(
  projectDir: string,
  componentId: string,
  placement: Placement
): Promise<void> {
  const canvas = await readCanvasJson(projectDir)
  const idx = canvas.components.findIndex(c => c.componentId === componentId)
  if (idx >= 0) {
    canvas.components[idx].placement = placement
  } else {
    canvas.components.push({ componentId, placement })
  }
  await writeFile(join(projectDir, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf-8')
}

export async function removeFromCanvasJson(
  projectDir: string,
  componentId: string
): Promise<void> {
  const canvas = await readCanvasJson(projectDir)
  canvas.components = canvas.components.filter(c => c.componentId !== componentId)
  await writeFile(join(projectDir, 'canvas.json'), JSON.stringify(canvas, null, 2), 'utf-8')
}
