// src/main/agent/orchestrator/index.ts
import { tool as defineTool } from 'ai'
import { runAgentStream } from '@cslate/shared/agent'
import { z } from 'zod'
import type { BuildTask, OrchestratorContext, SubAgentResult } from './types'
import { ComponentPlanSchema, PipelinePlanSchema, WiringPlanSchema } from './types'
import { buildOrchestratorSystemPrompt } from './prompts'
import { spawnBuildAgent, spawnFixAgent, spawnPipelineBuildAgent } from './sub-agent'
import { mainModelId, fastModelId } from '@cslate/shared/agent'
import { createSearchBlueprintsTool } from '../tools/searchBlueprints'
import { createScanLocalComponentsTool } from '../tools/scanLocalComponents'
import { createReadProjectContextTool } from '../tools/readProjectContext'
import { createReadManifestTool } from '../tools/readManifest'
import { validateManifest } from '../tools/validateManifest'
import { createWriteComponentTool } from '../tools/writeComponent'
import { validateBridgeDataUsage } from '../tools/bridgeValidation'
import { createReadFileCSTool } from '../tools/readFile'
import { createGrepCSTool } from '../tools/grep'
import { createGlobCSTool } from '../tools/glob'
import { createBashCSTool } from '../tools/bash'
import { createLspCSTool } from '../tools/lsp'
import { createWebFetchCSTool } from '../tools/webFetch'
import { engineLog } from '../../lib/logger'
import { saveStaging, clearStaging, listStaging, type StagedBuildPlan, type StagingState } from './staging'
import type { Logger } from 'pino'
import { buildToolSet } from '../tools/index'

type ShipFailure = { file: string; error: string }
type ShipResult = { success: true } | { success: false; failures: ShipFailure[] }

function failedShip(file: string, error: string): ShipResult {
  return { success: false, failures: [{ file, error }] }
}

function bridgeFailures(errors: string[]): ShipFailure[] {
  return errors.map((error) => {
    const match = /^([^:]+):\s*(.+)$/.exec(error)
    if (match) return { file: match[1], error: match[2] }
    return { file: 'ui.tsx', error }
  })
}

function writeFailures(errors: string[] | undefined): ShipFailure[] {
  const normalized = errors && errors.length > 0 ? errors : ['writeComponent failed']
  return normalized.map((error) => ({
    file: /\bmanifest(?:\.json)?\b/i.test(error) ? 'manifest.json' : 'ui.tsx',
    error,
  }))
}

/**
 * Assemble built files into a component, validate, write to disk, bundle,
 * emit agent:card, and optionally upload to server.
 * Returns true if shipping succeeded.
 */
async function shipComponent(
  ctx: OrchestratorContext,
  buildResults: SubAgentResult[],
  componentId: string,
  contextMd: string,
  log: Logger
): Promise<ShipResult> {
  const files: Record<string, string> = {}
  for (const r of buildResults) {
    if (r.status === 'success' && r.code.trim()) {
      files[r.file] = r.code.trim()
    }
  }

  if (!('ui.tsx' in files)) {
    log.warn('auto-assembly skipped: ui.tsx missing')
    return failedShip('ui.tsx', 'ui.tsx is missing or empty')
  }
  if (!('manifest.json' in files)) {
    log.warn('auto-assembly skipped: manifest.json missing')
    return failedShip('manifest.json', 'manifest.json is missing or empty')
  }

  let manifest: unknown
  try {
    manifest = JSON.parse(files['manifest.json'])
  } catch (e) {
    log.warn({ err: e }, 'auto-assembly skipped: manifest.json is not valid JSON')
    return failedShip(
      'manifest.json',
      `manifest.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  const rawValidation = (await validateManifest.execute!(
    { manifest },
    {} as any
  )) as { data?: Record<string, unknown> } & Record<string, unknown>
  const validation = (rawValidation?.data ?? rawValidation) as { valid: boolean; errors: string[] }
  if (!validation.valid) {
    log.warn({ errors: validation.errors }, 'auto-assembly skipped: manifest invalid')
    return failedShip('manifest.json', validation.errors.join('; ') || 'manifest.json failed validation')
  }

  const bridgeErrors = validateBridgeDataUsage(files, manifest)
  if (bridgeErrors.length > 0) {
    log.warn({ errors: bridgeErrors }, 'auto-assembly skipped: bridge validation failed')
    return { success: false, failures: bridgeFailures(bridgeErrors) }
  }

  const writeTool = createWriteComponentTool(ctx.projectDir).toAISDKTool()
  const writeFiles: Record<string, string> = { ...files }
  if (contextMd) {
    writeFiles['context.md'] = contextMd
  }

  const rawWriteResult = await writeTool.execute!(
    {
      componentId,
      files: writeFiles,
      manifest: manifest as Record<string, unknown>,
    },
    {} as any
  ) as { data?: Record<string, unknown> } & Record<string, unknown>

  const writeResult = (rawWriteResult?.data ?? rawWriteResult) as {
    success: boolean; componentId?: string; bundle?: string;
    placement?: unknown; manifest?: unknown; files?: Record<string, string>; errors?: string[]
  }

  if (!writeResult.success) {
    log.warn({ errors: writeResult.errors }, 'auto-assembly skipped: write failed')
    return { success: false, failures: writeFailures(writeResult.errors) }
  }

  ctx.sender.send('agent:tool-result', { tool: 'writeComponent', result: writeResult })
  if (writeResult.bundle) {
    ctx.sender.send('agent:card', {
      card: {
        bundle: writeResult.bundle,
        manifest: writeResult.manifest,
        componentId: writeResult.componentId,
        source: 'generated',
      },
    })
  }

  await clearStaging(ctx.projectDir, componentId)
  ctx.sender.send('agent:orchestrator:status', { phase: 'ship' })
  log.info({ componentId }, 'component shipped (auto-assembly)')

  if (ctx.serverClient && writeResult.files) {
    const uploadFiles: Record<string, string> = { ...writeResult.files }
    if (writeResult.bundle) {
      uploadFiles['bundle.js'] = writeResult.bundle
    }
    ctx.serverClient.uploadComponent(writeResult.manifest, uploadFiles).then((result) => {
      if (result.error) {
        log.warn({ componentId, error: result.error }, 'background upload failed')
      } else {
        log.info({ componentId, uploadId: result.uploadId, status: result.status }, 'component uploaded for review')
      }
    })
  }

  return { success: true }
}

export class Orchestrator {
  private ctx: OrchestratorContext
  private log = engineLog.child({ component: 'orchestrator' })

  constructor(ctx: OrchestratorContext) {
    this.ctx = ctx
  }

  async *stream(message: string): AsyncGenerator<unknown> {
    const { ctx } = this
    const modelId = mainModelId(ctx.config)
    const fastModel = fastModelId(ctx.config)

    const toolDeps = {
      projectDir: ctx.projectDir,
      registry: ctx.registry,
      fastModelId: fastModel,
      serverClient: ctx.serverClient,
      permissionBroker: ctx.permissionBroker,
    }
    const { aiTools: fixAgentTools } = buildToolSet(toolDeps, 'fix')
    const memoryContext = ctx.userMemory
    const cardContext =
      ctx.activeComponents.length > 0
        ? ctx.activeComponents
            .map(
              (c) =>
                `- ${c.componentId}: ${JSON.stringify((c.manifest as Record<string, unknown>).name)}`
            )
            .join('\n')
        : ''

    // Persistent build state — survives crashes, restarts, rate limits.
    // Saved to disk after each phase; restored at start of next run.
    let lastBuildResults: SubAgentResult[] = []
    let lastBuildTasks: BuildTask[] = []
    let lastPlan: StagedBuildPlan | null = null
    let componentShipped = false
    let stagedComponentId: string | null = null

    // Check for an incomplete build to resume.
    // Resume if:
    //   (a) same tab session (crash recovery — same tabId), OR
    //   (b) user explicitly referenced a component that has a staged build (intentional resume)
    // This prevents a new unrelated request from accidentally hijacking a stale staged build.
    const existingStates = await listStaging(ctx.projectDir)
    let resumeFrom: StagingState | null =
      existingStates.find(s => s.buildId === ctx.tabId) ??
      (ctx.targetComponentId
        ? existingStates.find(s => s.componentId === ctx.targetComponentId) ?? null
        : null)

    if (
      resumeFrom?.phase === 'planned' &&
      !resumeFrom.plan &&
      resumeFrom.messages.length === 0
    ) {
      this.log.warn(
        { componentId: resumeFrom.componentId },
        'discarding planned staging state without plan or messages'
      )
      await clearStaging(ctx.projectDir, resumeFrom.componentId)
      resumeFrom = null
    }

    const systemPrompt = buildOrchestratorSystemPrompt({
      memoryContext,
      cardContext,
      targetComponentId: ctx.targetComponentId,
      resumePhase: resumeFrom?.phase,
      resumePlanContext: resumeFrom?.plan
        ? JSON.stringify({
            componentId: resumeFrom.plan.componentId,
            contract: resumeFrom.plan.contract,
            tasks: resumeFrom.plan.tasks,
            pipelines: resumeFrom.plan.pipelines,
          }, null, 2)
        : '',
    })
    if (resumeFrom) {
      this.log.info(
        { componentId: resumeFrom.componentId, phase: resumeFrom.phase },
        'resuming from staged build state'
      )
      lastBuildResults = resumeFrom.buildResults
      lastPlan = resumeFrom.plan ?? null
      lastBuildTasks = resumeFrom.plan?.tasks ?? []
      stagedComponentId = resumeFrom.componentId
      ctx.sender.send('agent:orchestrator:status', { phase: 'validate' })
    }

    // Accumulate AI SDK response messages across steps for staging persistence.
    // Do NOT seed with prior run messages — calledInHistory (derived from staging phase)
    // is sufficient for phase detection, and injecting a failed run's history causes
    // the model to loop re-planning the same component.
    let accumulatedMessages: unknown[] =
      resumeFrom?.phase === 'planned' && !resumeFrom.plan
        ? resumeFrom.messages
        : []

    // Derive which phases are already complete from the staging phase field.
    // Scanning message history is unreliable — a failed prior run may include
    // assembleAndValidate calls that confuse phase detection into looping.
    const calledInHistory = new Set<string>()
    if (resumeFrom) {
      // All resumes have completed: search + plan
      calledInHistory.add('searchBlueprints')
      calledInHistory.add('planComponent')
      if (resumeFrom.phase === 'dispatched') {
        // dispatch is done — next step is assembleAndValidate
        calledInHistory.add('dispatchSubAgents')
      }
      this.log.info({ phase: resumeFrom.phase, calledInHistory: [...calledInHistory] }, 'resume phase seeded')
    }

    // Build orchestrator tools
    const tools = {
      searchBlueprints: createSearchBlueprintsTool(ctx.serverClient),
      scanLocalComponents: createScanLocalComponentsTool(ctx.projectDir),
      readProjectContext: createReadProjectContextTool(ctx.projectDir),
      readManifest: createReadManifestTool(ctx.projectDir),
      readFile: createReadFileCSTool(ctx.projectDir).toAISDKTool(),
      grep: createGrepCSTool(ctx.projectDir).toAISDKTool(),
      glob: createGlobCSTool(ctx.projectDir).toAISDKTool(),
      bash: createBashCSTool(ctx.projectDir, ctx.permissionBroker ?? { request: async () => true }).toAISDKTool(),
      lsp: createLspCSTool(ctx.projectDir).toAISDKTool(),
      webFetch: createWebFetchCSTool(ctx.serverClient).toAISDKTool(),

      planComponent: defineTool({
        description:
          'Define the build plan for components and optionally data pipelines. Call this after understanding requirements and searching for blueprints.',
        inputSchema: ComponentPlanSchema.extend({
          pipelines: z.array(PipelinePlanSchema).default([]).describe('Pipeline plans to build alongside this component'),
          wiring: z.array(WiringPlanSchema).default([]).describe('Wiring between components and pipelines'),
        }),
        execute: async (plan) => {
          this.log.info(
            { componentId: plan.componentId, taskCount: plan.tasks.length, pipelineCount: plan.pipelines.length },
            'plan created'
          )
          stagedComponentId = plan.componentId
          lastBuildTasks = plan.tasks
          lastPlan = {
            componentId: plan.componentId,
            contract: plan.contract,
            tasks: plan.tasks,
            pipelines: plan.pipelines,
          }
          // Staging is saved in onStepFinish after this step completes so
          // accumulatedMessages includes the plan tool call + result.
          return {
            planned: true,
            componentId: plan.componentId,
            taskCount: plan.tasks.length,
            pipelineCount: plan.pipelines.length,
          }
        },
      }),

      dispatchSubAgents: defineTool({
        description:
          'Dispatch parallel sub-agents to build all files in the plan. Each sub-agent builds one file. Also dispatches pipeline build agents in parallel. Returns results for all files.',
        inputSchema: z.object({
          componentId: z.string(),
          contract: z.string(),
          tasks: z.array(
            z.object({
              file: z.string(),
              assignment: z.string(),
              blueprint: z.string().nullable(),
            })
          ),
          pipelines: z.array(PipelinePlanSchema).default([]).describe('Pipeline plans to build in parallel'),
        }),
        execute: async (input) => {
          if (ctx.abortSignal?.aborted) {
            this.log.warn(
              { componentId: input.componentId, taskCount: input.tasks.length },
              'dispatchSubAgents skipped — run already aborted',
            )
            return {
              succeeded: 0,
              failed: input.tasks.length,
              files: input.tasks.map((t) => ({ file: t.file, status: 'error', error: 'Run aborted before dispatch' })),
              pipelines: [],
            }
          }
          lastBuildTasks = input.tasks
          this.log.info(
            { componentId: input.componentId, taskCount: input.tasks.length, pipelineCount: input.pipelines.length },
            'dispatching sub-agents'
          )
          ctx.sender.send('agent:orchestrator:status', {
            phase: 'dispatch',
            workerCount: input.tasks.length,
          })

          // Dispatch component and pipeline agents in parallel.
          // Build agents run single-shot (no tools) for speed; the blueprint
          // and contract give them enough context to generate in one turn.
          const siblingFiles = input.tasks.map((t) => t.file)

          const [componentResults, pipelineResultsNested] = await Promise.all([
            Promise.all(
              input.tasks.map((task, i) => {
                // Thin entry point (ui.tsx) uses the main model for composition quality.
                // Sub-components and boilerplate use the fast model for speed and cost.
                const isEntry = task.file === 'ui.tsx'
                const taskModelId = isEntry ? modelId : fastModel
                ctx.sender.send('agent:orchestrator:status', {
                  phase: 'worker',
                  workerId: i,
                  file: task.file,
                  status: 'building',
                  modelId: taskModelId,
                })
                return spawnBuildAgent({
                  task,
                  contract: input.contract,
                  modelId: taskModelId,
                  registry: ctx.registry,
                  siblingFiles,
                  abortSignal: ctx.abortSignal,
                }).then(async (result) => {
                  ctx.sender.send('agent:orchestrator:status', {
                    phase: 'worker',
                    workerId: i,
                    file: task.file,
                    status: result.status === 'success' ? 'done' : 'error',
                    telemetry: result.telemetry,
                  })
                  return result
                })
              })
            ),
            Promise.all(
              input.pipelines.map((pipelinePlan) =>
                spawnPipelineBuildAgent({
                  pipelinePlan,
                  modelId: fastModel,
                  registry: ctx.registry,
                  abortSignal: ctx.abortSignal,
                })
              )
            ),
          ])

          const pipelineResults = pipelineResultsNested.flat()

          // Store component results for use by assembleAndValidate
          lastBuildResults = componentResults

          // Persist built files to disk — survives crashes, rate limit drops, restarts
          if (stagedComponentId) {
            await saveStaging(ctx.projectDir, {
              componentId: stagedComponentId,
              buildId: ctx.tabId,
              phase: 'dispatched',
              timestamp: Date.now(),
              messages: [],  // messages snapshotted at plan phase; files are what matter now
              buildResults: componentResults,
              plan: lastPlan ?? undefined,
            })
          }

          const succeeded = componentResults.filter((r) => r.status === 'success')
          const failed = componentResults.filter((r) => r.status === 'error')
          const pipelineSucceeded = pipelineResults.filter((r) => r.status === 'success')
          const pipelineFailed = pipelineResults.filter((r) => r.status === 'error')
          this.log.info(
            { succeeded: succeeded.length, failed: failed.length, pipelineSucceeded: pipelineSucceeded.length, pipelineFailed: pipelineFailed.length },
            'sub-agents done'
          )
          if (componentResults.length > 0 && succeeded.length === 0) {
            const allTimedOut = failed.every((r) => r.telemetry?.status === 'timeout')
            this.log.error(
              {
                componentId: input.componentId,
                modelId,
                fastModel,
                taskCount: componentResults.length,
                allTimedOut,
                files: failed.map((r) => ({ file: r.file, status: r.telemetry?.status, durationMs: r.telemetry?.durationMs })),
              },
              allTimedOut
                ? 'all sub-agents timed out — model is too slow or unreachable for these budgets'
                : 'all sub-agents failed — see per-file errors above',
            )
          }
          return {
            succeeded: succeeded.length,
            failed: failed.length,
            files: componentResults.map(r => ({ file: r.file, status: r.status, error: r.error })),
            pipelines: pipelineResults.map(r => ({ file: r.file, status: r.status, error: r.error })),
          }
        },
      }),

      assembleAndValidate: defineTool({
        description:
          'Assemble the component from sub-agent results, validate manifest, and render in sandbox. Call after dispatchSubAgents returns.',
        inputSchema: z.object({
          componentId: z.string(),
          contextMd: z.string(),
        }),
        execute: async (input) => {
          this.log.info({ componentId: input.componentId }, 'assembling component')
          ctx.sender.send('agent:orchestrator:status', { phase: 'validate' })

          const shipResult = await shipComponent(
            ctx,
            lastBuildResults,
            input.componentId,
            input.contextMd,
            this.log
          )
          if (shipResult.success) {
            componentShipped = true
            return { success: true, componentId: input.componentId }
          }

          // shipComponent failed — give model a reason so it can fix or retry
          const failedFiles = lastBuildResults
            .filter((r) => r.status === 'error')
            .map((r) => ({ file: r.file, error: r.error ?? 'Build failed' }))
            .concat(shipResult.failures)
          return {
            success: false,
            error:
              failedFiles.length > 0
                ? `Build errors: ${failedFiles.map((f) => `${f.file}: ${f.error}`).join('; ')}`
                : 'Assembly failed — check build results',
          }
        },
      }),

      dispatchFixAgents: defineTool({
        description:
          'Dispatch fix sub-agents for files that failed to render. Provide the contract and which files need fixing with their errors.',
        inputSchema: z.object({
          contract: z.string(),
          fixes: z.array(
            z.object({
              file: z.string(),
              error: z.string(),
            })
          ),
        }),
        execute: async (input) => {
          if (ctx.abortSignal?.aborted) {
            this.log.warn(
              { fixCount: input.fixes.length },
              'dispatchFixAgents skipped — run already aborted',
            )
            return {
              succeeded: 0,
              failed: input.fixes.length,
              files: input.fixes.map((f) => ({ file: f.file, status: 'error', error: 'Run aborted before fix dispatch' })),
            }
          }
          this.log.info(
            { fixCount: input.fixes.length },
            'dispatching fix agents'
          )
          ctx.sender.send('agent:orchestrator:status', { phase: 'fix' })

          const results = await Promise.all(
            input.fixes.map((fix) => {
              // Read broken code from stored results — model doesn't echo it back
              const stored = lastBuildResults.find(r => r.file === fix.file)
              const task = lastBuildTasks.find(t => t.file === fix.file)
              const needsRebuild = !stored || stored.status !== 'success' || !stored.code.trim()
              if (needsRebuild && task) {
                this.log.info({ file: fix.file }, 'rebuilding from scratch instead of fixing')
                const taskModelId = task.file === 'ui.tsx' ? modelId : fastModel
                ctx.sender.send('agent:orchestrator:status', {
                  phase: 'fix',
                  file: fix.file,
                  status: 'building',
                  modelId: taskModelId,
                })
                return spawnBuildAgent({
                  task,
                  contract: input.contract,
                  modelId: taskModelId,
                  registry: ctx.registry,
                  abortSignal: ctx.abortSignal,
                }).then((result) => {
                  ctx.sender.send('agent:orchestrator:status', {
                    phase: 'fix',
                    file: fix.file,
                    status: result.status === 'success' ? 'done' : 'error',
                    telemetry: result.telemetry,
                  })
                  return result
                })
              }
              ctx.sender.send('agent:orchestrator:status', {
                phase: 'fix',
                file: fix.file,
                status: 'building',
                modelId,
              })
              return spawnFixAgent({
                file: fix.file,
                brokenCode: stored?.code ?? '',
                error: fix.error,
                contract: input.contract,
                modelId,
                registry: ctx.registry,
                aiTools: fixAgentTools,
                abortSignal: ctx.abortSignal,
              }).then((result) => {
                ctx.sender.send('agent:orchestrator:status', {
                  phase: 'fix',
                  file: fix.file,
                  status: result.status === 'success' ? 'done' : 'error',
                  telemetry: result.telemetry,
                })
                return result
              })
            })
          )

          // Merge fixed results back into lastBuildResults for the next assembleAndValidate
          // Also push new files (e.g. manifest.json created by a fix agent)
          for (const fixed of results) {
            const idx = lastBuildResults.findIndex(r => r.file === fixed.file)
            if (idx >= 0) {
              lastBuildResults[idx] = fixed
            } else {
              lastBuildResults.push(fixed)
            }
          }

          return {
            fixed: results.map(r => ({ file: r.file, status: r.status, error: r.error })),
          }
        },
      }),
    }

    // Run the orchestrator agent loop
    this.log.info({ modelId, message }, 'orchestrator starting')
    ctx.sender.send('agent:orchestrator:status', { phase: 'understand' })
    const t0 = Date.now()

    const SEARCH_TOOLS = ['searchBlueprints', 'scanLocalComponents', 'readProjectContext', 'readManifest'] as const
    type ToolName = keyof typeof tools

    const result = runAgentStream({
      modelId,
      registry: ctx.registry,
      system: systemPrompt,
      messages: [
        ...ctx.conversationHistory,
        { role: 'user' as const, content: message },
        ...(accumulatedMessages as any[]),
      ],
      tools,
      maxSteps: 10,
      maxOutputTokens: 8000,
      temperature: 0.2,
      abortSignal: ctx.abortSignal,
      onStepFinish: async ({ toolCalls, response }) => {
        // Accumulate response messages (assistant turn + tool results) for resume
        accumulatedMessages.push(...response.messages)

        const calledThisStep = new Set(toolCalls.map(c => c.toolName))

        // After plan step: save checkpoint so dispatch crash is recoverable
        if (calledThisStep.has('planComponent') && stagedComponentId) {
          await saveStaging(ctx.projectDir, {
            componentId: stagedComponentId,
            buildId: ctx.tabId,
            phase: 'planned',
            timestamp: Date.now(),
            messages: accumulatedMessages,
            buildResults: [],
            plan: lastPlan ?? undefined,
          })
        }

        // After dispatch step: update with built file results
        if (calledThisStep.has('dispatchSubAgents') && stagedComponentId) {
          await saveStaging(ctx.projectDir, {
            componentId: stagedComponentId,
            buildId: ctx.tabId,
            phase: 'dispatched',
            timestamp: Date.now(),
            messages: accumulatedMessages,
            buildResults: lastBuildResults,
            plan: lastPlan ?? undefined,
          })
        }
      },
      prepareStep: ({ steps }) => {
        // Union current-run tool calls with those parsed from resume history
        // so phase detection works correctly on both fresh and resumed runs.
        const calledNow = new Set(
          steps.flatMap(s => (s.toolCalls ?? []).map((c: any) => c.toolName))
        )
        const called = new Set([...calledInHistory, ...calledNow])
        // Count assembleAndValidate calls in the current run only (max 2: initial + after fix).
        const validateCount = steps.reduce(
          (n, s) => n + (s.toolCalls ?? []).filter((c: any) => c.toolName === 'assembleAndValidate').length,
          0
        )

        // Some models / providers don't support forced tool_choice (e.g.
        // DeepSeek via OpenRouter). Detect capability from modelId so we
        // don't break on any model — native providers keep forced tools,
        // everything else falls back to 'auto' with activeTools restriction.
        const supportsForcedTools = (() => {
          const [provider, model] = modelId.split(':')
          switch (provider) {
            case 'anthropic':
              return true
            case 'openai':
              // Native OpenAI models support forced tools; gateway-routed
              // models (deepseek/, mistral/, etc.) masquerade as openai:...
              return (
                model.startsWith('gpt-') ||
                model.startsWith('o1-') ||
                model.startsWith('o3-')
              )
            case 'google':
              return true
            case 'local':
              return false
            default:
              return false
          }
        })()

        const forceTool = (
          toolName: ToolName
        ): { toolChoice: 'auto' | { type: 'tool'; toolName: ToolName }; activeTools: ToolName[] } => {
          if (supportsForcedTools) {
            return { toolChoice: { type: 'tool' as const, toolName }, activeTools: [toolName] }
          }
          return { toolChoice: 'auto' as const, activeTools: [toolName] }
        }

        const requireTool = (
          activeTools: ToolName[]
        ): { toolChoice: 'required' | 'auto'; activeTools: ToolName[] } => {
          if (supportsForcedTools) {
            return { toolChoice: 'required' as const, activeTools }
          }
          return { toolChoice: 'auto' as const, activeTools }
        }

        const uniqueTools = (activeTools: ToolName[]): ToolName[] => [...new Set(activeTools)]
        const hasSearchContext = SEARCH_TOOLS.some(t => called.has(t))

        // Phase 5: second validate done (fix cycle complete) — stop
        if (validateCount >= 2) {
          return { toolChoice: 'none' as const }
        }
        // Phase 4b: after fix dispatch — must validate again
        if (called.has('dispatchFixAgents')) {
          return forceTool('assembleAndValidate')
        }
        // Phase 4a: after first validate — allow fix or finish naturally (model decides based on result)
        if (called.has('assembleAndValidate')) {
          return {
            toolChoice: 'auto' as const,
            activeTools: ['dispatchFixAgents' as ToolName],
          }
        }
        // Phase 3: after dispatch — must validate
        if (called.has('dispatchSubAgents')) {
          return forceTool('assembleAndValidate')
        }
        // Phase 2: after plan — must dispatch
        if (called.has('planComponent')) {
          return forceTool('dispatchSubAgents')
        }

        // Phase 1: after remote search/context read, keep the model on the
        // shortest path: one optional local scan, then plan. Full coding tools
        // are intentionally reserved for the fix phase and sub-agents.
        if (hasSearchContext) {
          const active: ToolName[] = ['planComponent' as ToolName]
          if (!called.has('scanLocalComponents')) {
            active.push('scanLocalComponents' as ToolName)
          }
          if (ctx.targetComponentId) {
            if (!called.has('readManifest')) active.push('readManifest' as ToolName)
            if (!called.has('readProjectContext')) active.push('readProjectContext' as ToolName)
          }
          return requireTool(uniqueTools(active))
        }

        // Phase 0: start with only the context needed for the request. New
        // builds search the shared library first; edits read the existing card.
        if (ctx.targetComponentId) {
          return requireTool([
            'readManifest' as ToolName,
            'readProjectContext' as ToolName,
            'searchBlueprints' as ToolName,
          ])
        }
        return forceTool('searchBlueprints' as ToolName)
      },
    })

    // Hold finish until after recovery so late agent:card events still attach
    // to the active streaming assistant message before renderer finalization.
    const finishParts: unknown[] = []
    for await (const part of result.fullStream) {
      if ((part as { type?: unknown }).type === 'finish') {
        finishParts.push(part)
      } else {
        yield part
      }
    }

    // Recovery: if build results exist but the stream ended without shipping,
    // attempt auto-assembly before giving up. Many gateway-routed models skip
    // the final assembleAndValidate call when tool_choice is not forced.
    if (!componentShipped && lastBuildResults.length > 0) {
      const successCount = lastBuildResults.filter(r => r.status === 'success').length
      this.log.warn(
        { successCount, total: lastBuildResults.length },
        'stream ended without shipping — attempting auto-assembly'
      )

      if (stagedComponentId && successCount > 0) {
        const assembled = await shipComponent(
          ctx,
          lastBuildResults,
          stagedComponentId,
          '',
          this.log
        )
        if (assembled.success) {
          componentShipped = true
          this.log.info({ componentId: stagedComponentId }, 'auto-assembly succeeded')
        } else {
          this.log.warn({ componentId: stagedComponentId, failures: assembled.failures }, 'auto-assembly failed')
          // Clear staging — this build won't recover without a fresh attempt
          await clearStaging(ctx.projectDir, stagedComponentId)
          ctx.sender.send('agent:error', {
            message: `${successCount} of ${lastBuildResults.length} files built successfully but assembly failed. Please retry.`,
            code: 'ASSEMBLY_FAILED',
          })
        }
      } else {
        if (stagedComponentId) {
          await clearStaging(ctx.projectDir, stagedComponentId)
        }
        ctx.sender.send('agent:error', {
          message: `${successCount} of ${lastBuildResults.length} files built successfully but the component wasn't assembled — the LLM stopped before finishing. Please retry.`,
          code: 'ASSEMBLY_DROPPED',
        })
      }
    }

    for (const part of finishParts) {
      yield part
    }

    this.log.info({ durationMs: Date.now() - t0 }, 'orchestrator done')
  }
}
