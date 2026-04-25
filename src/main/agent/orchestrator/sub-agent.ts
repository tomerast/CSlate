import { runSubAgent, stripFences } from '@cslate/shared/agent'
import { COMPONENT_TEMPLATE } from '@cslate/shared'
import { PLATFORM_KNOWLEDGE } from '../prompts/fragments'
import type { BuildTask, PipelinePlan, SubAgentResult } from './types'
import { engineLog } from '../../lib/logger'

const log = engineLog.child({ component: 'sub-agent' })

const BUILD_SYSTEM = `You are a CSlate component file builder. You produce ONE file of production-quality React/TypeScript code for the CSlate platform.

Rules:
- Return ONLY the file content - no markdown fences, no explanations, no preamble.
- Follow the contract exactly. Do not add props or types not in the contract.
- Build for the current inline model-card UI: compact, responsive, message-bubble width, max-height friendly, no canvas or placement assumptions.
- Keep the file small and direct. Prefer plain React, local constants, and Tailwind token classes.
- Do not import npm packages except react/react-dom. Do not call fetch; use bridge.fetch only when manifest dataSources define it.
- For ui.tsx, default export a React component and render useful seed data immediately when bridge is absent.
- For manifest.json, return valid JSON only. No comments, trailing commas, or markdown.
- For context.md, return 2-4 concise sentences.
- Follow the platform rules below.

${PLATFORM_KNOWLEDGE}`

const FIX_SYSTEM = `You are a CSlate component fixer. You receive broken code and an error message. Fix the code and return ONLY the fixed file content - no markdown fences, no explanations.

- Make the smallest change that resolves the error.
- Preserve the assignment, contract, exports, state keys, and manifest names unless the error requires changing them.
- Use bash and lsp to verify only when useful for the specific error.
- Use readFile, grep, or glob only if the error needs external context.

${PLATFORM_KNOWLEDGE}`

export function buildSubAgentPrompt(params: {
  task: BuildTask
  contract: string
  siblingFiles?: string[]
}): string {
  const { task, contract, siblingFiles } = params

  const siblingSection = siblingFiles && siblingFiles.length > 0
    ? `\n## Sibling Files\nThis component is built from multiple files running in parallel.\nDo not re-implement what lives in these files.\n${siblingFiles.map(f => `- ${f}`).join('\n')}\n`
    : ''

  const fallback = COMPONENT_TEMPLATE[task.file as keyof typeof COMPONENT_TEMPLATE]
  const blueprintSection = task.blueprint
    ? `\n## BLUEPRINT - ADAPT this code to match the assignment:\n\`\`\`\n${task.blueprint}\n\`\`\``
    : fallback
      ? `\n## STARTING POINT - ADAPT this template to the assignment:\n\`\`\`\n${fallback}\n\`\`\``
      : '\n## No template available - build from scratch.'

  const isEntry = task.file === 'ui.tsx'
  const importHint = isEntry && siblingFiles && siblingFiles.filter(f => f !== 'ui.tsx').length > 0
    ? `\n## Import hint\nImport sub-components with relative paths, e.g.:\nimport { StockHeader } from './components/StockHeader'\n`
    : ''

  return `## Contract
Shared types only. Follow exactly; do not invent cross-file props or exports.
\`\`\`typescript
${contract}
\`\`\`
${siblingSection}${blueprintSection}${importHint}

## File Output Rules
- Build exactly one file: \`${task.file}\`.
- Return only that file's content.
- If adapting a blueprint or template, keep only the parts that fit this assignment.
- Keep the implementation compact enough for an inline chat card, not an old canvas/dashboard layout.

## Assignment
${task.assignment}`
}

/**
 * File-specific budgets.
 * ui.tsx handles the full component when the model does not decompose.
 * Sub-components (components/*.tsx) are thin focused files that should write fast.
 * Manifest/types/boilerplate remain tight.
 */
const ENTRY_POINT_BUDGET = { maxOutputTokens: 9000, timeoutMs: 45_000 }
const COMPONENT_AGENT_BUDGET = { maxOutputTokens: 6000, timeoutMs: 20_000 }
const DEFAULT_BUILD_AGENT_BUDGET = { maxOutputTokens: 5000, timeoutMs: 18_000 }
const BUILD_AGENT_BUDGETS: Record<string, { maxOutputTokens: number; timeoutMs: number }> = {
  'ui.tsx': { ...ENTRY_POINT_BUDGET },
  'manifest.json': { maxOutputTokens: 3000, timeoutMs: 14_000 },
  'context.md': { maxOutputTokens: 1200, timeoutMs: 10_000 },
  'types.ts': { maxOutputTokens: 3500, timeoutMs: 14_000 },
  'logic.ts': { maxOutputTokens: 5000, timeoutMs: 18_000 },
}
const PIPELINE_AGENT_BUDGET = { maxOutputTokens: 6000, timeoutMs: 25_000 }
const FIX_AGENT_BUDGET = { maxOutputTokens: 9000, timeoutMs: 25_000 }

export function getBuildAgentBudget(file: string): { maxOutputTokens: number; timeoutMs: number } {
  if (file.startsWith('components/')) return COMPONENT_AGENT_BUDGET
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
  siblingFiles?: string[]
}): Promise<SubAgentResult> {
  const { task, contract, modelId, registry, aiTools, siblingFiles } = params
  const budget = getBuildAgentBudget(task.file)
  log.info({ file: task.file, modelId, budgetMaxTokens: budget.maxOutputTokens, budgetTimeoutMs: budget.timeoutMs, hasBlueprint: !!task.blueprint }, 'build agent spawned')
  const t0 = Date.now()

  try {
    const prompt = buildSubAgentPrompt({ task, contract, siblingFiles })
    const result = await withTimeout(
      runSubAgent({ modelId, registry, system: BUILD_SYSTEM, prompt, tools: aiTools, maxOutputTokens: budget.maxOutputTokens }),
      budget.timeoutMs,
      `build agent (${task.file})`
    )

    const durationMs = Date.now() - t0
    const outputTokens = result.usage?.outputTokens ?? 0
    const tokPerSec = Math.round((outputTokens / (durationMs / 1000)) * 10) / 10

    if (durationMs > 0) {
      log.info({
        file: task.file,
        modelId,
        durationMs,
        outputTokens,
        tokPerSec,
        steps: result.steps,
        status: 'success',
      }, 'build agent complete - token rate')
    }

    const code = stripFences(result.text)
    if (!code.trim()) {
      log.error({ file: task.file, modelId, durationMs }, 'build agent returned empty code')
      return { file: task.file, code: '', status: 'error', error: 'Generated empty code' }
    }
    return {
      file: task.file,
      code,
      status: 'success',
      error: null,
      telemetry: { modelId, durationMs, outputTokens, tokPerSec, status: 'success' },
    }
  } catch (err) {
    const durationMs = Date.now() - t0
    const rawMsg = err instanceof Error ? err.message : String(err)

    // Enrich timeout errors with actionable diagnostics.
    const isTimeout = rawMsg.toLowerCase().includes('timed out')
    const friendlyMsg = isTimeout
      ? `Build agent (${task.file}) timed out after ${budget.timeoutMs}ms using model "${modelId}". `
        + `This model may be slow for ${task.file} generation (${budget.maxOutputTokens} tokens budget). `
        + `Consider switching to a faster model or increasing the timeout budget.`
      : rawMsg

    log.error({
      file: task.file,
      modelId,
      durationMs,
      budgetTimeoutMs: budget.timeoutMs,
      budgetMaxTokens: budget.maxOutputTokens,
      err: rawMsg,
      isTimeout,
    }, 'build agent failed')

    return {
      file: task.file,
      code: '',
      status: 'error',
      error: friendlyMsg,
      telemetry: { modelId, durationMs, outputTokens: 0, tokPerSec: 0, status: isTimeout ? 'timeout' : 'error' },
    }
  }
}

const PIPELINE_BUILD_SYSTEM = `You are a CSlate pipeline file builder. You produce ONE file of production-quality TypeScript code for a CSlate data pipeline.

Rules:
- Return ONLY the file content - no markdown fences, no explanations, no preamble.
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
        ? `\n## BLUEPRINT - ADAPT this code:\n\`\`\`\n${task.blueprint}\n\`\`\``
        : '\n## No template available - build from scratch.'

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
        const result = await withTimeout(
          runSubAgent({ modelId, registry, system: PIPELINE_BUILD_SYSTEM, prompt, tools: aiTools, maxOutputTokens: PIPELINE_AGENT_BUDGET.maxOutputTokens }),
          PIPELINE_AGENT_BUDGET.timeoutMs,
          `pipeline build agent (${task.file})`
        )
        const durationMs = Date.now() - t0
        const outputTokens = result.usage?.outputTokens ?? 0
        if (durationMs > 0) {
          const tokPerSec = Math.round((outputTokens / (durationMs / 1000)) * 10) / 10
          log.info({ pipelineId: pipelinePlan.pipelineId, file: task.file, modelId, durationMs, outputTokens, tokPerSec, steps: result.steps, status: 'success' }, 'pipeline sub-agent complete - token rate')
        }
        const code = stripFences(result.text)
        if (!code.trim()) {
          log.error({ pipelineId: pipelinePlan.pipelineId, file: task.file, modelId, durationMs }, 'pipeline sub-agent returned empty code')
          return { file: task.file, code: '', status: 'error', error: 'Generated empty code' }
        }
        return {
          file: task.file,
          code,
          status: 'success',
          error: null,
          telemetry: { modelId, durationMs, outputTokens, tokPerSec: durationMs > 0 ? Math.round((outputTokens / (durationMs / 1000)) * 10) / 10 : 0, status: 'success' },
        }
      } catch (err) {
        const durationMs = Date.now() - t0
        const rawMsg = err instanceof Error ? err.message : String(err)
        const isTimeout = rawMsg.toLowerCase().includes('timed out')
        const friendlyMsg = isTimeout
          ? `Pipeline agent (${task.file}) timed out after ${PIPELINE_AGENT_BUDGET.timeoutMs}ms using model "${modelId}". Consider using a faster model.`
          : rawMsg
        log.error({ pipelineId: pipelinePlan.pipelineId, file: task.file, modelId, durationMs, budgetTimeoutMs: PIPELINE_AGENT_BUDGET.timeoutMs, err: rawMsg, isTimeout }, 'pipeline sub-agent failed')
        return {
          file: task.file,
          code: '',
          status: 'error',
          error: friendlyMsg,
          telemetry: { modelId, durationMs, outputTokens: 0, tokPerSec: 0, status: isTimeout ? 'timeout' : 'error' },
        }
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

    const result = await withTimeout(
      runSubAgent({ modelId, registry, system: FIX_SYSTEM, prompt, tools: aiTools, maxOutputTokens: FIX_AGENT_BUDGET.maxOutputTokens }),
      FIX_AGENT_BUDGET.timeoutMs,
      `fix agent (${file})`
    )
    const durationMs = Date.now() - t0
    const outputTokens = result.usage?.outputTokens ?? 0
    if (durationMs > 0) {
      const tokPerSec = Math.round((outputTokens / (durationMs / 1000)) * 10) / 10
      log.info({ file, modelId, durationMs, outputTokens, tokPerSec, steps: result.steps, status: 'success' }, 'fix agent complete - token rate')
    }

    const code = stripFences(result.text)
    if (!code.trim()) {
      log.error({ file, modelId, durationMs }, 'fix agent returned empty code')
      return { file, code: '', status: 'error', error: 'Generated empty code' }
    }
    return {
      file,
      code,
      status: 'success',
      error: null,
      telemetry: { modelId, durationMs, outputTokens, tokPerSec: durationMs > 0 ? Math.round((outputTokens / (durationMs / 1000)) * 10) / 10 : 0, status: 'success' },
    }
  } catch (err) {
    const durationMs = Date.now() - t0
    const rawMsg = err instanceof Error ? err.message : String(err)
    const isTimeout = rawMsg.toLowerCase().includes('timed out')
    const friendlyMsg = isTimeout
      ? `Fix agent (${file}) timed out after ${FIX_AGENT_BUDGET.timeoutMs}ms using model "${modelId}". Consider using a faster model.`
      : rawMsg
    log.error({ file, modelId, durationMs, budgetTimeoutMs: FIX_AGENT_BUDGET.timeoutMs, err: rawMsg, isTimeout }, 'fix agent failed')
    return {
      file,
      code: '',
      status: 'error',
      error: friendlyMsg,
      telemetry: { modelId, durationMs, outputTokens: 0, tokPerSec: 0, status: isTimeout ? 'timeout' : 'error' },
    }
  }
}
