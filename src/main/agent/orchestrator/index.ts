// src/main/agent/orchestrator/index.ts
import { streamText, stepCountIs, tool as defineTool } from 'ai'
import { z } from 'zod'
import type { OrchestratorContext, ComponentPlan, SubAgentResult } from './types'
import { ComponentPlanSchema } from './types'
import { buildOrchestratorSystemPrompt } from './prompts'
import { spawnBuildAgent, spawnFixAgent } from './sub-agent'
import { buildContextString } from '../memory/context-builder'
import { mainModelId } from '../providers'
import { createSearchBlueprintsTool } from '../tools/searchBlueprints'
import { createScanLocalComponentsTool } from '../tools/scanLocalComponents'
import { createReadProjectContextTool } from '../tools/readProjectContext'
import { createReadManifestTool } from '../tools/readManifest'
import { validateManifest } from '../tools/validateManifest'
import { createRenderComponentTool } from '../tools/renderComponent'
import { createWriteComponentTool } from '../tools/writeComponent'
import { engineLog } from '../../lib/logger'
import { bundlePartialUiTsx } from '../lib/bundler'
import { saveStaging, clearStaging, listStaging, type StagingState } from './staging'


export class Orchestrator {
  private ctx: OrchestratorContext
  private log = engineLog.child({ component: 'orchestrator' })

  constructor(ctx: OrchestratorContext) {
    this.ctx = ctx
  }

  async *stream(message: string): AsyncGenerator<unknown> {
    const { ctx } = this
    const modelId = mainModelId(ctx.config)
    const memoryContext = buildContextString(ctx.memory)
    const canvasContext =
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
    let lastBuildResults: import('./types').SubAgentResult[] = []
    let componentShipped = false
    let stagedComponentId: string | null = null

    // Check for an incomplete build to resume.
    // Resume if:
    //   (a) same tab session (crash recovery — same tabId), OR
    //   (b) user explicitly referenced a component that has a staged build (intentional resume)
    // This prevents a new unrelated request from accidentally hijacking a stale staged build.
    const existingStates = await listStaging(ctx.projectDir)
    const resumeFrom: StagingState | null =
      existingStates.find(s => s.buildId === ctx.tabId) ??
      (ctx.targetComponentId
        ? existingStates.find(s => s.componentId === ctx.targetComponentId) ?? null
        : null)

    const systemPrompt = buildOrchestratorSystemPrompt({
      memoryContext,
      canvasContext,
      targetComponentId: ctx.targetComponentId,
      resumePhase: resumeFrom?.phase,
    })
    if (resumeFrom) {
      this.log.info(
        { componentId: resumeFrom.componentId, phase: resumeFrom.phase },
        'resuming from staged build state'
      )
      lastBuildResults = resumeFrom.buildResults
      stagedComponentId = resumeFrom.componentId
      ctx.sender.send('agent:orchestrator:status', { phase: 'validate' })
    }

    // Accumulate AI SDK response messages across steps for staging persistence.
    // Do NOT seed with prior run messages — calledInHistory (derived from staging phase)
    // is sufficient for phase detection, and injecting a failed run's history causes
    // the model to loop re-planning the same component.
    let accumulatedMessages: unknown[] = []

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

      planComponent: defineTool({
        description:
          'Define the component build plan. Call this after understanding requirements and searching for blueprints.',
        inputSchema: ComponentPlanSchema,
        execute: async (plan) => {
          this.log.info(
            { componentId: plan.componentId, taskCount: plan.tasks.length },
            'plan created'
          )
          stagedComponentId = plan.componentId
          ctx.sender.send('agent:build:plan', {
            buildId: ctx.tabId,
            componentId: plan.componentId,
            description: plan.requirements,
            tasks: plan.tasks.map(t => ({ file: t.file, assignment: t.assignment })),
          })
          // Staging is saved in onStepFinish after this step completes so
          // accumulatedMessages includes the plan tool call + result.
          return {
            planned: true,
            componentId: plan.componentId,
            taskCount: plan.tasks.length,
          }
        },
      }),

      dispatchSubAgents: defineTool({
        description:
          'Dispatch parallel sub-agents to build all files in the plan. Each sub-agent builds one file. Returns results for all files.',
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
        }),
        execute: async (input) => {
          this.log.info(
            { componentId: input.componentId, taskCount: input.tasks.length },
            'dispatching sub-agents'
          )
          ctx.sender.send('agent:orchestrator:status', {
            phase: 'dispatch',
            workerCount: input.tasks.length,
          })

          const results: import('./types').SubAgentResult[] = await Promise.all(
            input.tasks.map((task, i) => {
              ctx.sender.send('agent:orchestrator:status', {
                phase: 'worker',
                workerId: i,
                file: task.file,
                status: 'building',
              })
              return spawnBuildAgent({
                task,
                contract: input.contract,
                modelId,
                registry: ctx.registry,
              }).then(async (result) => {
                ctx.sender.send('agent:orchestrator:status', {
                  phase: 'worker',
                  workerId: i,
                  file: task.file,
                  status: 'done',
                })
                // Attempt partial bundle for ui.tsx so the renderer can show a preview
                if (task.file === 'ui.tsx' && result.status === 'success') {
                  try {
                    const bundle = await bundlePartialUiTsx(result.code)
                    ctx.sender.send('agent:build:partial', { buildId: ctx.tabId, bundle })
                  } catch {
                    ctx.sender.send('agent:build:partial', {
                      buildId: ctx.tabId,
                      source: result.code,
                    })
                  }
                }
                return result
              })
            })
          )

          // Store for use by assembleAndValidate — model doesn't need to echo code back
          lastBuildResults = results

          // Persist built files to disk — survives crashes, rate limit drops, restarts
          if (stagedComponentId) {
            await saveStaging(ctx.projectDir, {
              componentId: stagedComponentId,
              buildId: ctx.tabId,
              phase: 'dispatched',
              timestamp: Date.now(),
              messages: [],  // messages snapshotted at plan phase; files are what matter now
              buildResults: results,
            })
          }

          const succeeded = results.filter((r) => r.status === 'success')
          const failed = results.filter((r) => r.status === 'error')
          this.log.info(
            { succeeded: succeeded.length, failed: failed.length },
            'sub-agents done'
          )
          return {
            succeeded: succeeded.length,
            failed: failed.length,
            files: results.map(r => ({ file: r.file, status: r.status, error: r.error })),
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
          this.log.info(
            { componentId: input.componentId },
            'assembling component'
          )
          ctx.sender.send('agent:orchestrator:status', { phase: 'validate' })

          // Read build results from closure — not passed by model to avoid token blowout
          const files: Record<string, string> = {}
          for (const r of lastBuildResults) {
            if (r.status === 'success') {
              files[r.file] = r.code
            }
          }

          if (!files['ui.tsx']) {
            return {
              success: false,
              error: 'ui.tsx build failed — cannot assemble component',
            }
          }

          // Read manifest from built manifest.json — model doesn't pass it to avoid token blowout
          if (!files['manifest.json']) {
            return {
              success: false,
              error: 'manifest.json missing — ensure manifest.json is included as a sub-agent task',
            }
          }
          let manifest: unknown
          try {
            manifest = JSON.parse(files['manifest.json'])
          } catch (e) {
            return {
              success: false,
              error: `manifest.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
            }
          }

          // Validate manifest
          const validation = (await validateManifest.execute!(
            { manifest },
            {} as any
          )) as { valid: boolean; errors: string[] }
          if (!validation.valid) {
            return {
              success: false,
              error: `Manifest invalid: ${validation.errors.join(', ')}`,
            }
          }

          // Render in sandbox — pass all built files, not just hardcoded names
          const renderTool = createRenderComponentTool()
          const renderResult = (await renderTool.execute!(
            { files, manifest },
            {} as any
          )) as { success: boolean; componentId: string; errors?: string[] }
          if (!renderResult.success) {
            const errDetail = (renderResult.errors ?? []).join(', ')
            return { success: false, error: errDetail ? `Render failed: ${errDetail}` : 'Render failed' }
          }

          // Write to disk — pass all built files + context.md
          const writeTool = createWriteComponentTool(ctx.projectDir)
          const writeFiles: Record<string, string> = { ...files }
          if (input.contextMd) {
            writeFiles['context.md'] = input.contextMd
          }

          const writeResult = await writeTool.execute!(
            {
              componentId: input.componentId,
              files: writeFiles,
              manifest: manifest as Record<string, unknown>,
            },
            {} as any
          ) as { success: boolean; componentId?: string; bundle?: string; placement?: unknown; manifest?: unknown; errors?: string[] }

          if (!writeResult.success) {
            return { success: false, error: (writeResult.errors ?? []).join(', ') || 'Write failed' }
          }

          // Notify renderer so it can add the component to the canvas
          ctx.sender.send('agent:tool-result', { tool: 'writeComponent', result: writeResult })

          componentShipped = true
          // Clear staging — build is complete
          await clearStaging(ctx.projectDir, input.componentId)
          ctx.sender.send('agent:orchestrator:status', { phase: 'ship' })
          this.log.info(
            { componentId: input.componentId },
            'component shipped'
          )
          return { success: true, componentId: input.componentId }
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
          this.log.info(
            { fixCount: input.fixes.length },
            'dispatching fix agents'
          )
          ctx.sender.send('agent:orchestrator:status', { phase: 'fix' })

          const results = await Promise.all(
            input.fixes.map((fix) => {
              // Read broken code from stored results — model doesn't echo it back
              const stored = lastBuildResults.find(r => r.file === fix.file)
              return spawnFixAgent({
                file: fix.file,
                brokenCode: stored?.code ?? '',
                error: fix.error,
                contract: input.contract,
                modelId,
                registry: ctx.registry,
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
    ctx.sender.send('agent:build:start', { buildId: ctx.tabId })
    ctx.sender.send('agent:orchestrator:status', { phase: 'understand' })
    const t0 = Date.now()

    const SEARCH_TOOLS = ['searchBlueprints', 'scanLocalComponents', 'readProjectContext', 'readManifest'] as const
    type ToolName = keyof typeof tools

    const result = streamText({
      model: ctx.registry.languageModel(modelId),
      system: systemPrompt,
      messages: [
        ...ctx.conversationHistory,
        { role: 'user' as const, content: message },
        ...(accumulatedMessages as any[]),
      ],
      tools,
      stopWhen: stepCountIs(15),
      maxOutputTokens: 16000,
      temperature: 0.2,
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
          })
        }
      },
      prepareStep: ({ steps }) => {
        // Union current-run tool calls with those parsed from resume history
        // so phase detection works correctly on both fresh and resumed runs.
        const calledNow = new Set(
          steps.flatMap(s => (s.toolCalls ?? []).map(c => c.toolName))
        )
        const called = new Set([...calledInHistory, ...calledNow])
        // Count assembleAndValidate calls in the current run only (max 2: initial + after fix).
        const validateCount = steps.reduce(
          (n, s) => n + (s.toolCalls ?? []).filter(c => c.toolName === 'assembleAndValidate').length,
          0
        )

        // Phase 5: second validate done (fix cycle complete) — stop
        if (validateCount >= 2) {
          return { toolChoice: 'none' as const }
        }
        // Phase 4b: after fix dispatch — must validate again
        if (called.has('dispatchFixAgents')) {
          return {
            toolChoice: { type: 'tool' as const, toolName: 'assembleAndValidate' as ToolName },
            activeTools: ['assembleAndValidate' as ToolName],
          }
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
          return {
            toolChoice: { type: 'tool' as const, toolName: 'assembleAndValidate' as ToolName },
            activeTools: ['assembleAndValidate' as ToolName],
          }
        }
        // Phase 2: after plan — must dispatch
        if (called.has('planComponent')) {
          return {
            toolChoice: { type: 'tool' as const, toolName: 'dispatchSubAgents' as ToolName },
            activeTools: ['dispatchSubAgents' as ToolName],
          }
        }
        // Phase 1: after first search — allow remaining search tools + plan (model decides when ready)
        if (SEARCH_TOOLS.some(t => called.has(t))) {
          const remainingSearch = SEARCH_TOOLS.filter(t => !called.has(t)) as ToolName[]
          return {
            toolChoice: 'required' as const,
            activeTools: [...remainingSearch, 'planComponent' as ToolName],
          }
        }
        // Phase 0: no tools called yet — must search first
        return {
          toolChoice: 'required' as const,
          activeTools: [...SEARCH_TOOLS] as ToolName[],
        }
      },
    })

    for await (const part of result.fullStream) {
      yield part
    }

    // Recovery: if build results exist but the stream ended without shipping,
    // surface a clear error rather than silently dropping the work.
    // We can't recover without the manifest (model-generated), so prompt the user to retry.
    if (!componentShipped && lastBuildResults.length > 0) {
      const successCount = lastBuildResults.filter(r => r.status === 'success').length
      this.log.warn(
        { successCount, total: lastBuildResults.length },
        'stream ended without shipping — build results were dropped'
      )
      // Clear staging — this build won't recover without a fresh attempt
      if (stagedComponentId) {
        await clearStaging(ctx.projectDir, stagedComponentId)
      }
      ctx.sender.send('agent:error', {
        message: `${successCount} of ${lastBuildResults.length} files built successfully but the component wasn't assembled — the LLM stopped before finishing. Please send the same request again to complete it.`,
        code: 'ASSEMBLY_DROPPED',
      })
    }

    this.log.info({ durationMs: Date.now() - t0 }, 'orchestrator done')
  }
}
