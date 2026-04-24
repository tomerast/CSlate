export { validateManifest, validateManifestTool } from './validateManifest'
export { createReviewCodeTool } from './reviewCode'
export { createWriteComponentTool } from './writeComponent'
export { createReadManifestTool } from './readManifest'
export { createReadProjectContextTool } from './readProjectContext'
export { createSearchBlueprintsTool } from './searchBlueprints'
export { createScanLocalComponentsTool } from './scanLocalComponents'
export { createValidatePipelineManifestTool } from './validatePipelineManifest'
export { createReadPipelineManifestTool } from './readPipelineManifest'
export { createWritePipelineTool } from './writePipeline'
export { createDryRunPipelineTool } from './dryRunPipeline'
export { createScanLocalPipelinesTool } from './scanLocalPipelines'
export { createSearchPipelineBlueprintsTool } from './searchPipelineBlueprints'
export type { CSTool, ToolResult, ToolUseContext, ValidationResult } from './types'
export { buildTool } from './types'

import type { CSTool } from './types'
import type { CSlateServerClient } from '../../server/CSlateServerClient'
import type { PermissionBroker } from './bash/permissions'
import { validateManifestTool } from './validateManifest'
import { createReviewCodeTool } from './reviewCode'
import { createWriteComponentTool } from './writeComponent'
import { createReadManifestCSTool } from './readManifest'
import { createReadProjectContextCSTool } from './readProjectContext'
import { createSearchBlueprintsCSTool } from './searchBlueprints'
import { createScanLocalComponentsCSTool } from './scanLocalComponents'
import { createValidatePipelineManifestTool } from './validatePipelineManifest'
import { createReadPipelineManifestTool } from './readPipelineManifest'
import { createWritePipelineTool } from './writePipeline'
import { createDryRunPipelineTool } from './dryRunPipeline'
import { createScanLocalPipelinesTool } from './scanLocalPipelines'
import { createSearchPipelineBlueprintsTool } from './searchPipelineBlueprints'
import { createReadFileCSTool } from './readFile'
import { createGrepCSTool } from './grep'
import { createGlobCSTool } from './glob'
import { createBashCSTool } from './bash'
import { createLspCSTool } from './lsp'
import { createWebFetchCSTool } from './webFetch'

// PermissionBroker defined in bash/permissions.ts to avoid circular imports
export type { PermissionBroker } from './bash/permissions'

export type ToolFactoryDeps = {
  projectDir: string
  registry: { languageModel: (id: string) => any }
  fastModelId: string
  serverClient: CSlateServerClient | null
  permissionBroker?: PermissionBroker
}

export type ToolTier = 'build' | 'fix' | 'orchestrator'

export function buildToolSet(
  deps: ToolFactoryDeps,
  tier: ToolTier = 'orchestrator'
): {
  csTools: CSTool[]
  aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>>
} {
  const broker = deps.permissionBroker ?? { request: async () => true }

  const baseTools: CSTool[] = [
    validateManifestTool,
    createReadManifestCSTool(deps.projectDir),
    createReadProjectContextCSTool(deps.projectDir),
  ]

  const pipelineTools: CSTool[] = [
    createValidatePipelineManifestTool(),
    createReadPipelineManifestTool(),
    createWritePipelineTool(),
    createDryRunPipelineTool(),
    createScanLocalPipelinesTool(),
    createSearchPipelineBlueprintsTool(deps.serverClient),
  ]

  const buildTools: CSTool[] = [
    ...baseTools,
    ...pipelineTools,
    createSearchBlueprintsCSTool(deps.serverClient),
    createScanLocalComponentsCSTool(deps.projectDir),
    createWriteComponentTool(deps.projectDir),
    createReviewCodeTool(deps.registry, deps.fastModelId),
    createReadFileCSTool(deps.projectDir),
    createGrepCSTool(deps.projectDir),
    createGlobCSTool(deps.projectDir),
    createWebFetchCSTool(deps.serverClient),
  ]

  const fixTools: CSTool[] = [
    ...baseTools,
    createReadFileCSTool(deps.projectDir),
    createGrepCSTool(deps.projectDir),
    createGlobCSTool(deps.projectDir),
    createBashCSTool(deps.projectDir, broker),
    createLspCSTool(deps.projectDir),
  ]

  const orchestratorTools: CSTool[] = [
    ...baseTools,
    ...pipelineTools,
    createSearchBlueprintsCSTool(deps.serverClient),
    createScanLocalComponentsCSTool(deps.projectDir),
    createWriteComponentTool(deps.projectDir),
    createReviewCodeTool(deps.registry, deps.fastModelId),
    createReadFileCSTool(deps.projectDir),
    createGrepCSTool(deps.projectDir),
    createGlobCSTool(deps.projectDir),
    createBashCSTool(deps.projectDir, broker),
    createLspCSTool(deps.projectDir),
    createWebFetchCSTool(deps.serverClient),
  ]

  const csTools: CSTool[] =
    tier === 'build' ? buildTools
    : tier === 'fix' ? fixTools
    : orchestratorTools

  const aiTools: Record<string, ReturnType<CSTool['toAISDKTool']>> = {}
  for (const tool of csTools) {
    aiTools[tool.name] = tool.toAISDKTool()
  }

  return { csTools, aiTools }
}
