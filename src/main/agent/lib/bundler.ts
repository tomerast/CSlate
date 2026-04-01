import * as esbuild from 'esbuild'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'

const EXTERNALS = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']

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
      jsx: 'transform',
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
    jsx: 'transform',
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

/**
 * Bundle a single ui.tsx string for partial preview.
 * Stubs all relative imports with empty objects so missing
 * hook/type files don't block the bundle.
 */
export async function bundlePartialUiTsx(uiTsxContent: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'cslate-partial-'))
  try {
    await writeFile(join(tmpDir, 'ui.tsx'), uiTsxContent, 'utf-8')

    const result = await esbuild.build({
      entryPoints: [join(tmpDir, 'ui.tsx')],
      bundle: true,
      format: 'cjs',
      jsx: 'transform',
      target: 'es2020',
      write: false,
      logLevel: 'silent',
      external: EXTERNALS,
      plugins: [
        {
          name: 'stub-missing-locals',
          setup(build) {
            // Stub every relative import — only ui.tsx exists in tmpDir
            build.onResolve({ filter: /^\./ }, () => ({
              path: 'stub',
              namespace: 'stub-missing',
            }))
            build.onLoad({ filter: /.*/, namespace: 'stub-missing' }, () => ({
              contents: 'module.exports = {}',
              loader: 'js',
            }))
          },
        },
      ],
    })

    if (result.errors.length > 0) {
      throw new Error(result.errors.map(e => e.text).join('\n'))
    }

    return result.outputFiles[0].text
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
