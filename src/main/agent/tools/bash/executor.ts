export async function execute(_opts: { command: string; cwd: string; timeout: number; abortSignal?: AbortSignal }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return { stdout: '', stderr: '', exitCode: 0 }
}
