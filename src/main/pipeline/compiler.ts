import * as esbuild from 'esbuild'
import { join } from 'node:path'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const ESBUILD_OPTIONS: esbuild.BuildOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'silent',
}

/**
 * Compile a pipeline from its directory on disk.
 * Writes compiled/worker-bundle.js and returns its path.
 */
export async function compilePipeline(pipelineDir: string): Promise<string> {
  const outDir = join(pipelineDir, 'compiled')
  await mkdir(outDir, { recursive: true })

  const outfile = join(outDir, 'worker-bundle.js')

  const result = await esbuild.build({
    ...ESBUILD_OPTIONS,
    entryPoints: [join(pipelineDir, 'pipeline.ts')],
    outfile,
    write: true,
  })

  if (result.errors.length > 0) {
    throw new Error(`Pipeline compilation failed:\n${result.errors.map((e) => e.text).join('\n')}`)
  }

  return outfile
}

/**
 * Compile a pipeline from in-memory files (for dry-run / preview).
 * Returns the bundle code as a string. Cleans up temp dir.
 */
export async function compilePipelineFromFiles(
  files: Record<string, string>,
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cslate-pipeline-'))

  try {
    await Promise.all(
      Object.entries(files).map(([name, content]) =>
        writeFile(join(tempDir, name), content),
      ),
    )

    const result = await esbuild.build({
      ...ESBUILD_OPTIONS,
      entryPoints: [join(tempDir, 'pipeline.ts')],
      write: false,
    })

    if (result.errors.length > 0) {
      throw new Error(
        `Pipeline compilation failed:\n${result.errors.map((e) => e.text).join('\n')}`,
      )
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
