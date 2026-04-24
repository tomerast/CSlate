// src/main/agent/orchestrator/staging.ts
//
// Persists orchestrator build state to disk after each phase so a dropped
// build can be resumed on the next run — by restoring the LLM message history
// and the built file code, then continuing the streamText from that point.

import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { BuildTask, PipelinePlan, SubAgentResult } from './types'

export type StagingPhase = 'planned' | 'dispatched'

export interface StagedBuildPlan {
  componentId: string
  contract: string
  tasks: BuildTask[]
  pipelines: PipelinePlan[]
}

export interface StagingState {
  componentId: string
  buildId: string
  phase: StagingPhase
  timestamp: number
  // Full AI SDK message history up to this point (tool calls + results)
  // Fed back into streamText so the LLM resumes in-context
  messages: unknown[]
  // Built file results — restored into the closure so assembleAndValidate
  // can read them without the model re-echoing large code
  buildResults: SubAgentResult[]
  // Exact dispatch inputs. This lets simple models resume after a saved plan
  // without reconstructing tasks from a previous tool-call transcript.
  plan?: StagedBuildPlan
}

const STAGING_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function stagingDir(projectDir: string): string {
  return join(projectDir, '.agent-staging')
}

function stagingPath(projectDir: string, componentId: string): string {
  return join(stagingDir(projectDir), `${componentId}.json`)
}

export async function saveStaging(
  projectDir: string,
  state: StagingState
): Promise<void> {
  const dir = stagingDir(projectDir)
  await mkdir(dir, { recursive: true })
  await writeFile(stagingPath(projectDir, state.componentId), JSON.stringify(state, null, 2), 'utf-8')
}

export async function loadStaging(
  projectDir: string,
  componentId: string
): Promise<StagingState | null> {
  const path = stagingPath(projectDir, componentId)
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf-8')
    const state = JSON.parse(raw) as StagingState
    if (Date.now() - state.timestamp > STAGING_TTL_MS) {
      await clearStaging(projectDir, componentId)
      return null
    }
    return state
  } catch {
    return null
  }
}

export async function clearStaging(
  projectDir: string,
  componentId: string
): Promise<void> {
  const path = stagingPath(projectDir, componentId)
  if (existsSync(path)) {
    await unlink(path).catch(() => {})
  }
}

/** List all incomplete staging states in a project, newest first. */
export async function listStaging(projectDir: string): Promise<StagingState[]> {
  const dir = stagingDir(projectDir)
  if (!existsSync(dir)) return []
  const { readdir } = await import('fs/promises')
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'))
  const states: StagingState[] = []
  for (const f of files) {
    try {
      const raw = await readFile(join(dir, f), 'utf-8')
      const state = JSON.parse(raw) as StagingState
      if (Date.now() - state.timestamp <= STAGING_TTL_MS) {
        states.push(state)
      }
    } catch {}
  }
  return states.sort((a, b) => b.timestamp - a.timestamp)
}
