import * as esbuild from 'esbuild'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'

const EXTERNALS = ['react', 'react-dom']

/**
 * Bundle component files into a single CJS string.
 * Writes to a temp dir, runs esbuild with native resolution, cleans up.
 * Entry point is always ui.tsx.
 */
export async function bundleComponentFiles(
  files: Record<string, string>
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cslate-build-'))
  try {
    await Promise.all(
      Object.entries(files).map(async ([relPath, content]) => {
        const absPath = join(tmpDir, relPath)
        await mkdir(dirname(absPath), { recursive: true })
        await writeFile(absPath, content, 'utf-8')
      })
    )

    const result = await esbuild.build({
      entryPoints: [join(tmpDir, 'ui.tsx')],
      bundle: true,
      format: 'cjs',
      target: 'es2020',
      write: false,
      logLevel: 'silent',
      external: EXTERNALS,
    })

    if (result.errors.length > 0) {
      throw new Error(result.errors.map(e => e.text).join('\n'))
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Bundle a component from its persisted directory on disk.
 * Used by writeComponent after source files are already written.
 */
export async function bundleComponentDir(componentDir: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [join(componentDir, 'ui.tsx')],
    bundle: true,
    format: 'cjs',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    external: EXTERNALS,
  })

  if (result.errors.length > 0) {
    throw new Error(result.errors.map(e => e.text).join('\n'))
  }

  return result.outputFiles[0].text
}
