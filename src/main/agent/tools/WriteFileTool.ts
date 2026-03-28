import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { Tool } from './types'

export class WriteFileTool implements Tool {
  name = 'write_file'
  description = 'Write content to a file in the project directory'
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to file' },
      content: { type: 'string', description: 'Content to write' }
    },
    required: ['path', 'content']
  }

  async execute(input: unknown): Promise<unknown> {
    const { path, content } = input as { path: string; content: string }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf-8')
    return { written: path }
  }
}
