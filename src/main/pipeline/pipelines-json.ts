import { readFile, writeFile } from 'node:fs/promises'
import { safePath } from '../lib/paths'
import type { PipelinesJson, PipelineEntry } from './types'

export async function readPipelinesJson(projectDir: string): Promise<PipelinesJson> {
  try {
    const filePath = safePath(projectDir, 'pipelines.json')
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as PipelinesJson
  } catch {
    return { pipelines: [] }
  }
}

export async function writePipelinesJson(
  projectDir: string,
  data: PipelinesJson,
): Promise<void> {
  const filePath = safePath(projectDir, 'pipelines.json')
  await writeFile(filePath, JSON.stringify(data, null, 2))
}

export async function upsertPipelineEntry(
  projectDir: string,
  entry: PipelineEntry,
): Promise<void> {
  const data = await readPipelinesJson(projectDir)
  const idx = data.pipelines.findIndex((p) => p.pipelineId === entry.pipelineId)
  if (idx >= 0) {
    data.pipelines[idx] = entry
  } else {
    data.pipelines.push(entry)
  }
  await writePipelinesJson(projectDir, data)
}

export async function removePipelineEntry(
  projectDir: string,
  pipelineId: string,
): Promise<void> {
  const data = await readPipelinesJson(projectDir)
  data.pipelines = data.pipelines.filter((p) => p.pipelineId !== pipelineId)
  await writePipelinesJson(projectDir, data)
}
