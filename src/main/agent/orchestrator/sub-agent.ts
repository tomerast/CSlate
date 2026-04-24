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
- Build for the current inline model-card UI: compact, responsive, message-bubble width, max-height friendly, no canvas or placement assumptions.
- Keep the file small and direct. Prefer plain React, local constants, and Tailwind token classes.
- Do not import npm packages except react/react-dom. Do not call fetch; use bridge.fetch only when manifest dataSources define it.
- For ui.tsx, default export a React component and render useful seed data immediately when bridge is absent.
- For manifest.json, return valid JSON only. No comments, trailing commas, or markdown.
- For context.md, return 2-4 concise sentences.
- Follow the platform rules below.

${PLATFORM_KNOWLEDGE}`

const FIX_SYSTEM = `You are a CSlate component fixer. You receive broken code and an error message. Fix the code and return ONLY the fixed file content — no markdown fences, no explanations.

- Make the smallest change that resolves the error.
- Preserve the assignment, contract, exports, state keys, and manifest names unless the error requires changing them.
- Use bash and lsp to verify only when useful for the specific error.
- Use readFile, grep, or glob only if the error needs external context.

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

  return `## Contract
Shared types only. Follow exactly; do not invent cross-file props or exports.
\`\`\`typescript
${contract}
\`\`\`
${blueprintSection}

## File Output Rules
- Build exactly one file: \`${task.file}\`.
- Return only that file's content.
- If adapting a blueprint or template, keep only the parts that fit this assignment.
- Keep the implementation compact enough for an inline chat card, not an old canvas/dashboard layout.

## Assignment
${task.assignment}`
}

const DEFAULT_BUILD_AGENT_BUDGET = { maxOutputTokens: 5000, timeoutMs: 18_000 }
const BUILD_AGENT_BUDGETS: Record<string, { maxOutputTokens: number; timeoutMs: number }> = {
  'ui.tsx': { maxOutputTokens: 9000, timeoutMs: 30_000 },
  'manifest.json': { maxOutputTokens: 3000, timeoutMs: 14_000 },
  'context.md': { maxOutputTokens: 1200, timeoutMs: 10_000 },
  'types.ts': { maxOutputTokens: 3500, timeoutMs: 14_000 },
  'logic.ts': { maxOutputTokens: 5000, timeoutMs: 18_000 },
}
const PIPELINE_AGENT_BUDGET = { maxOutputTokens: 6000, timeoutMs: 25_000 }
const FIX_AGENT_BUDGET = { maxOutputTokens: 9000, timeoutMs: 25_000 }

export function getBuildAgentBudget(file: string): { maxOutputTokens: number; timeoutMs: number } {
  return BUILD_AGENT_BUDGETS[file] ?? DEFAULT_BUILD_AGENT_BUDGET
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
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
    const budget = getBuildAgentBudget(task.file)
    const { text } = await withTimeout(
      runSubAgent({ modelId, registry, system: BUILD_SYSTEM, prompt, tools: aiTools, maxOutputTokens: budget.maxOutputTokens }),
      budget.timeoutMs,
      `build agent (${task.file})`
    )

    const code = stripFences(text)
    if (!code.trim()) {
      log.error({ file: task.file, durationMs: Date.now() - t0 }, 'build agent returned empty code')
      return { file: task.file, code: '', status: 'error', error: 'Generated empty code' }
    }
    log.info({ file: task.file, durationMs: Date.now() - t0 }, 'build agent done')
    return { file: task.file, code, status: 'success', error: null }
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
- Keep the implementation direct and stateless unless streaming explicitly requires state.
- Do not hardcode secrets or API keys. Use declared secrets/config.

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

      const prompt = `## Pipeline ID
${pipelinePlan.pipelineId}

## Requirements
${pipelinePlan.requirements}
${blueprintSection}

## File Output Rules
- Build exactly one file: \`${task.file}\`.
- Return only that file's content.
- Keep the code minimal and focused on the required data contract.

## Assignment
${task.assignment}`

      try {
        const { text } = await withTimeout(
          runSubAgent({ modelId, registry, system: PIPELINE_BUILD_SYSTEM, prompt, tools: aiTools, maxOutputTokens: PIPELINE_AGENT_BUDGET.maxOutputTokens }),
          PIPELINE_AGENT_BUDGET.timeoutMs,
          `pipeline build agent (${task.file})`
        )
        const code = stripFences(text)
        if (!code.trim()) {
          log.error({ pipelineId: pipelinePlan.pipelineId, file: task.file, durationMs: Date.now() - t0 }, 'pipeline sub-agent returned empty code')
          return { file: task.file, code: '', status: 'error', error: 'Generated empty code' }
        }
        log.info({ pipelineId: pipelinePlan.pipelineId, file: task.file, durationMs: Date.now() - t0 }, 'pipeline sub-agent done')
        return { file: task.file, code, status: 'success', error: null }
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
    const prompt = `## Contract
\`\`\`typescript
${contract}
\`\`\`

## Broken File
${file}
\`\`\`
${brokenCode}
\`\`\`

## Error
${error}

Fix the code. Return only the corrected ${file} content.`

    const { text } = await withTimeout(
      runSubAgent({ modelId, registry, system: FIX_SYSTEM, prompt, tools: aiTools, maxOutputTokens: FIX_AGENT_BUDGET.maxOutputTokens }),
      FIX_AGENT_BUDGET.timeoutMs,
      `fix agent (${file})`
    )

    const code = stripFences(text)
    if (!code.trim()) {
      log.error({ file, durationMs: Date.now() - t0 }, 'fix agent returned empty code')
      return { file, code: '', status: 'error', error: 'Generated empty code' }
    }
    log.info({ file, durationMs: Date.now() - t0 }, 'fix agent done')
    return { file, code, status: 'success', error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ file, err: msg }, 'fix agent failed')
    return { file, code: '', status: 'error', error: msg }
  }
}
