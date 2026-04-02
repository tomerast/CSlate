import { z } from 'zod'
import { spawn } from 'child_process'
import { buildTool, type CSTool } from './types'

type LspInput = { files?: string[] }
type Diagnostic = { file: string; line: number; col: number; message: string; severity: 'error' | 'warning' }
type LspOutput = { diagnostics: Diagnostic[] } | { error: string }

const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+:.+)$/

function parseTscOutput(output: string, scopeFiles?: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const line of output.split('\n')) {
    const match = TSC_LINE.exec(line.trim())
    if (!match) continue
    const [, file, lineStr, colStr, severity, message] = match
    if (scopeFiles && !scopeFiles.includes(file)) continue
    diagnostics.push({
      file,
      line: parseInt(lineStr, 10),
      col: parseInt(colStr, 10),
      message,
      severity: severity as 'error' | 'warning',
    })
  }
  return diagnostics
}

function runTsc(projectDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd: projectDir,
      env: { ...process.env },
    })
    let output = ''
    let settled = false
    child.stdout.on('data', (d: Buffer) => { output += d.toString() })
    child.stderr.on('data', (d: Buffer) => { output += d.toString() })
    child.on('close', () => {
      if (!settled) { settled = true; resolve(output) }
    })
    child.on('error', (err) => {
      if (!settled) { settled = true; reject(err) }
    })
  })
}

export function createLspCSTool(projectDir: string): CSTool<LspInput, LspOutput> {
  return buildTool<LspInput, LspOutput>({
    name: 'lsp',
    description:
      'Run TypeScript type checking (tsc --noEmit) on the project and return structured diagnostics. Use after writing or fixing a file to verify there are no type errors. Optionally scope to specific files.',
    inputSchema: z.object({
      files: z.array(z.string()).optional().describe('Scope diagnostics to these file paths (relative to project root). Omit to check all files.'),
    }),
    call: async (input: LspInput): Promise<{ data: LspOutput }> => {
      try {
        const output = await runTsc(projectDir)
        const diagnostics = parseTscOutput(output, input.files)
        return { data: { diagnostics } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `tsc failed to run: ${msg}` } }
      }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => false,
  })
}
