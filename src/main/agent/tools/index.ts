export { validateManifest, validateManifestTool } from './validateManifest'
export { createReviewCodeTool } from './reviewCode'
export { createRenderComponentTool } from './renderComponent'
export { createWriteComponentTool } from './writeComponent'
export { createReadManifestTool } from './readManifest'
export { createReadProjectContextTool } from './readProjectContext'
export { createSearchBlueprintsTool } from './searchBlueprints'
export { createScanLocalComponentsTool } from './scanLocalComponents'
export type { CSTool, ToolResult, ToolUseContext, ValidationResult } from './types'
export { buildTool } from './types'

import type { CSTool } from './types'
import type { CSlateServerClient } from '../../server/CSlateServerClient'
import { validateManifestTool } from './validateManifest'
import { createReviewCodeTool } from './reviewCode'
import { createRenderComponentTool } from './renderComponent'
import { createWriteComponentTool } from './writeComponent'
import { createReadManifestCSTool } from './readManifest'
import { createReadProjectContextCSTool } from './readProjectContext'
import { createSearchBlueprintsCSTool } from './searchBlueprints'
import { createScanLocalComponentsCSTool } from './scanLocalComponents'

export type ToolFactoryDeps = {
  projectDir: string
  registry: { languageModel: (id: string) => any }
  fastModelId: string
  serverClient: CSlateServerClient | null
}

/**
 * Build the complete tool array for a given context.
 * Returns both the CSTool instances and AI SDK compatible tools.
 */
export function buildToolSet(deps: ToolFactoryDeps): {
  csTools: CSTool[]
  aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>>
} {
  const csTools: CSTool[] = [
    validateManifestTool,
    createReadManifestCSTool(deps.projectDir),
    createReadProjectContextCSTool(deps.projectDir),
    createSearchBlueprintsCSTool(deps.serverClient),
    createScanLocalComponentsCSTool(deps.projectDir),
    createRenderComponentTool(),
    createWriteComponentTool(deps.projectDir),
    createReviewCodeTool(deps.registry, deps.fastModelId),
  ]

  const aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>> = {}
  for (const tool of csTools) {
    aiTools[tool.name] = tool.toAISDKTool()
  }

  return { csTools, aiTools }
}
