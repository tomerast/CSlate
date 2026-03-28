import { readFileSync, existsSync } from 'fs'
import type { Tool } from './types'

export class ReadFileTool implements Tool {
  name = 'read_file'
  description = 'Read a file from the project directory'
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to file' }
    },
    required: ['path']
  }

  async execute(input: unknown): Promise<unknown> {
    const { path } = input as { path: string }
    if (!existsSync(path)) return { error: `File not found: ${path}` }
    return { content: readFileSync(path, 'utf-8') }
  }
}
