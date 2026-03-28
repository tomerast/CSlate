import { writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import type { Tool } from './types'

export class WriteFileTool implements Tool {
  name = 'write_file'
  description = 'Write content to a file in the project directory'
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file (relative to project directory)' },
      content: { type: 'string', description: 'Content to write' }
    },
    required: ['path', 'content']
  }

  async execute(input: unknown, projectDir: string | null): Promise<unknown> {
    if (!projectDir) return { error: 'No project directory set' }
    const { path, content } = input as { path: string; content: string }
    const resolved = resolve(projectDir, path)
    if (!resolved.startsWith(projectDir + '/') && resolved !== projectDir) {
      return { error: 'Path is outside the project directory' }
    }
    mkdirSync(dirname(resolved), { recursive: true })
    writeFileSync(resolved, content, 'utf-8')
    return { written: resolved }
  }
}
