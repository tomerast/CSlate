import { spawn } from 'child_process'

type ExecuteOptions = {
  command: string
  cwd: string
  timeout: number
  abortSignal?: AbortSignal
}
type ExecuteResult = { stdout: string; stderr: string; exitCode: number }

export async function execute(opts: ExecuteOptions): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', opts.command], {
      cwd: opts.cwd,
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    const MAX = 100_000

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > MAX) stdout = stdout.slice(0, MAX) + '\n[truncated]'
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      if (stderr.length > MAX) stderr = stderr.slice(0, MAX) + '\n[truncated]'
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${opts.timeout}ms`))
    }, opts.timeout)

    if (opts.abortSignal) {
      opts.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
        reject(new Error('Command aborted'))
      })
    }

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
