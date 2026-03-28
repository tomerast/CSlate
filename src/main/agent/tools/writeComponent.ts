import type { Tool } from 'ai'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

type FilesInput = z.infer<typeof FilesSchema>
type WriteInput = { componentId: string; files: FilesInput; manifest: unknown; contextMd: string }
type WriteOutput = { success: boolean; path: string }

export function createWriteComponentTool(projectDir: string): Tool<WriteInput, WriteOutput> {
  return {
    description: 'Save a component package to the project directory. Only call this after validateManifest returns valid=true and reviewCode returns passed=true.',
    inputSchema: z.object({
      componentId: z.string().describe('snake_case identifier, e.g. "stock_ticker"'),
      files: FilesSchema,
      manifest: z.any().describe('The validated ComponentManifest object'),
      contextMd: z.string().describe('AI-generated summary of what was built and why. 2-4 sentences.'),
    }) as any,
    execute: async (input: WriteInput): Promise<WriteOutput> => {
      const dir = join(projectDir, 'components', input.componentId)
      await mkdir(dir, { recursive: true })

      const writes: Promise<void>[] = [
        writeFile(join(dir, 'manifest.json'), JSON.stringify(input.manifest, null, 2), 'utf-8'),
        writeFile(join(dir, 'context.md'), input.contextMd, 'utf-8'),
        writeFile(join(dir, 'ui.tsx'), input.files['ui.tsx'], 'utf-8'),
      ]
      if (input.files['logic.ts']) writes.push(writeFile(join(dir, 'logic.ts'), input.files['logic.ts'], 'utf-8'))
      if (input.files['types.ts']) writes.push(writeFile(join(dir, 'types.ts'), input.files['types.ts'], 'utf-8'))

      await Promise.all(writes)
      return { success: true, path: dir }
    },
  }
}
