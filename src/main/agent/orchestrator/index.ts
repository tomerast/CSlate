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

    const systemPrompt = buildOrchestratorSystemPrompt({
      memoryContext,
      canvasContext,
    })

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
          ctx.sender.send('agent:build:plan', {
            buildId: ctx.tabId,
            componentId: plan.componentId,
            description: plan.requirements,
            tasks: plan.tasks.map(t => ({ file: t.file, assignment: t.assignment })),
          })
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

          const results = await Promise.all(
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

          const succeeded = results.filter((r) => r.status === 'success')
          const failed = results.filter((r) => r.status === 'error')
          this.log.info(
            { succeeded: succeeded.length, failed: failed.length },
            'sub-agents done'
          )
          return {
            results,
            succeeded: succeeded.length,
            failed: failed.length,
          }
        },
      }),

      assembleAndValidate: defineTool({
        description:
          'Assemble the component from sub-agent results, validate manifest, and render in sandbox. Call after dispatchSubAgents returns.',
        inputSchema: z.object({
          componentId: z.string(),
          results: z.array(
            z.object({
              file: z.string(),
              code: z.string(),
              status: z.enum(['success', 'error']),
              error: z.string().nullable(),
            })
          ),
          manifest: z.any(),
          contextMd: z.string(),
        }),
        execute: async (input) => {
          this.log.info(
            { componentId: input.componentId },
            'assembling component'
          )
          ctx.sender.send('agent:orchestrator:status', { phase: 'validate' })

          // Build files map from results
          const files: Record<string, string> = {}
          for (const r of input.results) {
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

          // Validate manifest
          const validation = (await validateManifest.execute!(
            { manifest: input.manifest },
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
            { files, manifest: input.manifest },
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
              manifest: input.manifest as Record<string, unknown>,
            },
            {} as any
          ) as { success: boolean; componentId?: string; bundle?: string; placement?: unknown; manifest?: unknown; errors?: string[] }

          if (!writeResult.success) {
            return { success: false, error: (writeResult.errors ?? []).join(', ') || 'Write failed' }
          }

          // Notify renderer so it can add the component to the canvas
          ctx.sender.send('agent:tool-result', { tool: 'writeComponent', result: writeResult })

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
          'Dispatch fix sub-agents for files that failed to render. Returns fixed results.',
        inputSchema: z.object({
          contract: z.string(),
          fixes: z.array(
            z.object({
              file: z.string(),
              brokenCode: z.string(),
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
            input.fixes.map((fix) =>
              spawnFixAgent({
                ...fix,
                contract: input.contract,
                modelId,
                registry: ctx.registry,
              })
            )
          )

          return { results }
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
      ],
      tools,
      stopWhen: stepCountIs(15),
      maxOutputTokens: 4000,
      temperature: 0.2,
      prepareStep: ({ steps }) => {
        const called = new Set(
          steps.flatMap(s => (s.toolCalls ?? []).map(c => c.toolName))
        )
        // Count how many times assembleAndValidate has been called (max 2: initial + after fix)
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

    this.log.info({ durationMs: Date.now() - t0 }, 'orchestrator done')
  }
}
