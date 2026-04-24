import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join, resolve, sep, dirname } from 'path'
import { validateComponentPackage } from '@cslate/shared'
import { bundleComponentDir } from '../lib/bundler'
import { stripFences } from '@cslate/shared/agent'
import { buildTool } from './types'

type WriteInput = {
  componentId: string
  files: Record<string, string>
  manifest: Record<string, unknown>
  republish?: boolean
}

type WriteOutput = {
  success: boolean
  path: string
  componentId?: string
  bundle?: string
  manifest?: unknown
  files?: Record<string, string>
  republish?: boolean
  errors?: string[]
}

/**
 * Save a component package to disk and build its bundle.
 * Post-canvas-retirement: placement is gone. Orchestrator emits agent:card
 * events for inline rendering directly (see Phase 3 of the migration plan).
 */
export function createWriteComponentTool(projectDir: string) {
  return buildTool<WriteInput, WriteOutput>({
    name: 'writeComponent',
    description:
      'Save a component package to disk and build its bundle. ' +
      'Writes source files under components/{id}/ and produces bundle.js. ' +
      'Only call after validateManifest returns valid=true.',
    inputSchema: z.object({
      componentId: z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]*$/)
        .describe('lowercase identifier, e.g. "weather_widget"'),
      files: z
        .record(z.string())
        .describe(
          'All component files by relative path. ui.tsx required. ' +
            'Include any structure. Include "context.md" as a file.',
        ),
      manifest: z.any().describe('The validated ComponentManifest object'),
      republish: z
        .boolean()
        .optional()
        .describe(
          'Whether this update should be shared with the community. ' +
            'true for new components and bug fixes, false for minor visual tweaks. Defaults to true.',
        ),
    }),
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
    call: async (input: WriteInput) => {
      const componentsRoot = resolve(projectDir, 'components')
      const componentDir = resolve(componentsRoot, input.componentId)
      if (!componentDir.startsWith(componentsRoot + sep)) {
        return {
          data: { success: false, path: '', errors: ['Invalid componentId: path traversal'] },
        }
      }

      const cleanFiles: Record<string, string> = {}
      for (const [filePath, content] of Object.entries(input.files)) {
        cleanFiles[filePath] = stripFences(content)
      }

      const validation = validateComponentPackage({ manifest: input.manifest, files: cleanFiles })
      if (!validation.valid) {
        return { data: { success: false, path: '', errors: validation.errors } }
      }

      await mkdir(componentDir, { recursive: true })
      await writeFile(
        join(componentDir, 'manifest.json'),
        JSON.stringify(input.manifest, null, 2),
        'utf-8',
      )
      await Promise.all(
        Object.entries(cleanFiles).map(async ([filePath, content]) => {
          const target = join(componentDir, filePath)
          if (!target.startsWith(componentDir + sep)) {
            throw new Error(`Path traversal in files: "${filePath}"`)
          }
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, content, 'utf-8')
        }),
      )

      let bundle: string
      try {
        bundle = await bundleComponentDir(componentDir)
      } catch (e) {
        return {
          data: {
            success: false,
            path: componentDir,
            errors: [e instanceof Error ? e.message : String(e)],
          },
        }
      }

      await writeFile(join(componentDir, 'bundle.js'), bundle, 'utf-8')

      return {
        data: {
          success: true,
          path: componentDir,
          componentId: input.componentId,
          bundle,
          manifest: input.manifest,
          files: cleanFiles,
          republish: input.republish ?? true,
        },
      }
    },
  })
}
