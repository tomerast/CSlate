import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { Tool } from './types'

export class ReadFileTool implements Tool {
  name = 'read_file'
  description = 'Read a file from the project directory'
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file (relative to project directory)' }
    },
    required: ['path']
  }

  async execute(input: unknown, projectDir: string | null): Promise<unknown> {
    if (!projectDir) return { error: 'No project directory set' }
    const { path } = input as { path: string }
    const resolved = resolve(projectDir, path)
    if (!resolved.startsWith(projectDir + '/') && resolved !== projectDir) {
      return { error: 'Path is outside the project directory' }
    }
    if (!existsSync(resolved)) return { error: `File not found: ${path}` }
    return { content: readFileSync(resolved, 'utf-8') }
  }
}
