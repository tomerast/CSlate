import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readCanvasJson, updateCanvasJson, removeFromCanvasJson } from '../canvasJson'

let projectDir: string

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'cslate-canvas-test-'))
})

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true })
})

describe('readCanvasJson', () => {
  it('returns empty components when canvas.json does not exist', async () => {
    const result = await readCanvasJson(projectDir)
    expect(result).toEqual({ components: [] })
  })
})

describe('updateCanvasJson', () => {
  it('creates canvas.json with new component', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    const raw = await readFile(join(projectDir, 'canvas.json'), 'utf-8')
    const data = JSON.parse(raw)
    expect(data.components).toHaveLength(1)
    expect(data.components[0].componentId).toBe('weather')
    expect(data.components[0].placement.x).toBe(10)
  })

  it('updates existing component placement', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await updateCanvasJson(projectDir, 'weather', { x: 20, y: 10, width: 30, height: 25 })
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(1)
    expect(result.components[0].placement.x).toBe(20)
  })

  it('adds second component without affecting first', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await updateCanvasJson(projectDir, 'stocks', { x: 50, y: 5, width: 25, height: 20 })
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(2)
  })
})

describe('removeFromCanvasJson', () => {
  it('removes component by id', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await updateCanvasJson(projectDir, 'stocks', { x: 50, y: 5, width: 25, height: 20 })
    await removeFromCanvasJson(projectDir, 'weather')
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(1)
    expect(result.components[0].componentId).toBe('stocks')
  })

  it('is a no-op for missing component', async () => {
    await updateCanvasJson(projectDir, 'weather', { x: 10, y: 5, width: 30, height: 25 })
    await removeFromCanvasJson(projectDir, 'nonexistent')
    const result = await readCanvasJson(projectDir)
    expect(result.components).toHaveLength(1)
  })
})
