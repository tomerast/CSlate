import { tool } from 'ai'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

export function createWriteComponentTool(projectDir: string) {
  return tool({
    description: 'Save a component package to the project directory. Only call this after validateManifest returns valid=true and reviewCode returns passed=true.',
    parameters: z.object({
      componentId: z.string().describe('snake_case identifier, e.g. "stock_ticker"'),
      files: FilesSchema,
      manifest: z.unknown().describe('The validated ComponentManifest object'),
      contextMd: z.string().describe('AI-generated summary of what was built and why. 2-4 sentences.'),
    }),
    execute: async ({ componentId, files, manifest, contextMd }) => {
      const dir = join(projectDir, 'components', componentId)
      await mkdir(dir, { recursive: true })

      const writes: Promise<void>[] = [
        writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8'),
        writeFile(join(dir, 'context.md'), contextMd, 'utf-8'),
        writeFile(join(dir, 'ui.tsx'), files['ui.tsx'], 'utf-8'),
      ]
      if (files['logic.ts']) writes.push(writeFile(join(dir, 'logic.ts'), files['logic.ts'], 'utf-8'))
      if (files['types.ts']) writes.push(writeFile(join(dir, 'types.ts'), files['types.ts'], 'utf-8'))

      await Promise.all(writes)
      return { success: true, path: dir }
    },
  })
}
