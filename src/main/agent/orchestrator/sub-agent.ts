import { runSubAgent, stripFences } from '@cslate/shared/agent'
import { COMPONENT_TEMPLATE } from '@cslate/shared'
import { PLATFORM_KNOWLEDGE } from '../prompts/fragments'
import type { BuildTask, PipelinePlan, SubAgentResult } from './types'
import { engineLog } from '../../lib/logger'

const log = engineLog.child({ component: 'sub-agent' })

const BUILD_SYSTEM = `You are a CSlate component file builder. You produce ONE file of production-quality React/TypeScript code for the CSlate platform.

Rules:
- Return ONLY the file content — no markdown fences, no explanations, no preamble.
- Follow the contract exactly. Do not add props or types not in the contract.
- Follow all platform rules below.
- You have exploration tools available (readFile, grep, glob, webFetch). Use them to read existing components for patterns, find type definitions, or fetch documentation before writing.

${PLATFORM_KNOWLEDGE}`

const FIX_SYSTEM = `You are a CSlate component fixer. You receive broken code and an error message. Fix the code and return ONLY the fixed file content — no markdown fences, no explanations.

- Use bash and lsp to verify your fix compiles before returning.
- Use readFile, grep, or glob to explore the codebase for context if needed.

${PLATFORM_KNOWLEDGE}`

export function buildSubAgentPrompt(params: {
  task: BuildTask
  contract: string
}): string {
  const { task, contract } = params

  const fallback = COMPONENT_TEMPLATE[task.file as keyof typeof COMPONENT_TEMPLATE]
  const blueprintSection = task.blueprint
    ? `\n## BLUEPRINT — ADAPT this code to match the assignment:\n\`\`\`\n${task.blueprint}\n\`\`\``
    : fallback
      ? `\n## STARTING POINT — ADAPT this template to the assignment:\n\`\`\`\n${fallback}\n\`\`\``
      : '\n## No template available — build from scratch.'

  return `## CONTRACT (shared types — follow exactly):\n\`\`\`typescript\n${contract}\n\`\`\`\n${blueprintSection}\n\n## ASSIGNMENT:\nBuild file \`${task.file}\`: ${task.assignment}`
}

export async function spawnBuildAgent(params: {
  task: BuildTask
  contract: string
  modelId: string
  registry: { languageModel: (id: string) => any }
  aiTools?: Record<string, any>
}): Promise<SubAgentResult> {
  const { task, contract, modelId, registry, aiTools } = params
  log.info({ file: task.file, hasBlueprint: !!task.blueprint }, 'build agent spawned')
  const t0 = Date.now()

  try {
    const prompt = buildSubAgentPrompt({ task, contract })
    const { text } = await runSubAgent({ modelId, registry, system: BUILD_SYSTEM, prompt, tools: aiTools, maxOutputTokens: 12000 })

    log.info({ file: task.file, durationMs: Date.now() - t0 }, 'build agent done')
    return { file: task.file, code: stripFences(text), status: 'success', error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ file: task.file, err: msg }, 'build agent failed')
    return { file: task.file, code: '', status: 'error', error: msg }
  }
}

const PIPELINE_BUILD_SYSTEM = `You are a CSlate pipeline file builder. You produce ONE file of production-quality TypeScript code for a CSlate data pipeline.

Rules:
- Return ONLY the file content — no markdown fences, no explanations, no preamble.
- Pipelines must implement the DataPipeline interface: execute(params) for on-demand/polling, stream?(params, push) for streaming.
- Follow all platform rules below.
- You have exploration tools available (readFile, grep, glob, webFetch). Use them to read existing pipelines for patterns or fetch documentation before writing.

${PLATFORM_KNOWLEDGE}`

export async function spawnPipelineBuildAgent(params: {
  pipelinePlan: PipelinePlan
  modelId: string
  registry: { languageModel: (id: string) => any }
  aiTools?: Record<string, any>
}): Promise<SubAgentResult[]> {
  const { pipelinePlan, modelId, registry, aiTools } = params
  log.info({ pipelineId: pipelinePlan.pipelineId, taskCount: pipelinePlan.tasks.length }, 'pipeline build agents spawned')

  const results = await Promise.all(
    pipelinePlan.tasks.map(async (task): Promise<SubAgentResult> => {
      log.info({ pipelineId: pipelinePlan.pipelineId, file: task.file }, 'pipeline sub-agent spawned')
      const t0 = Date.now()

      const blueprintSection = task.blueprint
        ? `\n## BLUEPRINT — ADAPT this code:\n\`\`\`\n${task.blueprint}\n\`\`\``
        : '\n## No template available — build from scratch.'

      const prompt = `## PIPELINE ID: ${pipelinePlan.pipelineId}\n## REQUIREMENTS:\n${pipelinePlan.requirements}\n${blueprintSection}\n\n## ASSIGNMENT:\nBuild file \`${task.file}\`: ${task.assignment}`

      try {
        const { text } = await runSubAgent({ modelId, registry, system: PIPELINE_BUILD_SYSTEM, prompt, tools: aiTools, maxOutputTokens: 12000 })
        log.info({ pipelineId: pipelinePlan.pipelineId, file: task.file, durationMs: Date.now() - t0 }, 'pipeline sub-agent done')
        return { file: task.file, code: stripFences(text), status: 'success', error: null }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error({ pipelineId: pipelinePlan.pipelineId, file: task.file, err: msg }, 'pipeline sub-agent failed')
        return { file: task.file, code: '', status: 'error', error: msg }
      }
    })
  )

  return results
}

export async function spawnFixAgent(params: {
  file: string
  brokenCode: string
  error: string
  contract: string
  modelId: string
  registry: { languageModel: (id: string) => any }
  aiTools?: Record<string, any>
}): Promise<SubAgentResult> {
  const { file, brokenCode, error, contract, modelId, registry, aiTools } = params
  log.info({ file, error }, 'fix agent spawned')
  const t0 = Date.now()

  try {
    const prompt = `## CONTRACT:\n\`\`\`typescript\n${contract}\n\`\`\`\n\n## BROKEN CODE (file: ${file}):\n\`\`\`\n${brokenCode}\n\`\`\`\n\n## ERROR:\n${error}\n\nFix the code. Return ONLY the corrected file content.`

    const { text } = await runSubAgent({ modelId, registry, system: FIX_SYSTEM, prompt, tools: aiTools, maxOutputTokens: 12000 })

    log.info({ file, durationMs: Date.now() - t0 }, 'fix agent done')
    return { file, code: stripFences(text), status: 'success', error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ file, err: msg }, 'fix agent failed')
    return { file, code: '', status: 'error', error: msg }
  }
}
