import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PipelinesJson, PipelineEntry } from './types'

async function readPipelinesJson(projectDir: string): Promise<PipelinesJson> {
  try {
    const raw = await readFile(join(projectDir, 'pipelines.json'), 'utf-8')
    return JSON.parse(raw) as PipelinesJson
  } catch {
    return { pipelines: [] }
  }
}

async function writePipelinesJson(projectDir: string, data: PipelinesJson): Promise<void> {
  await writeFile(join(projectDir, 'pipelines.json'), JSON.stringify(data, null, 2), 'utf-8')
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
