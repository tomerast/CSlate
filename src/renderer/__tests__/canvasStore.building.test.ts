import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import type { BuildingCard } from '../canvas/building/types'

const card: BuildingCard = {
  buildId: 'test-build-1',
  phase: 'think',
  tasks: [],
  placement: { x: 2, y: 2, width: 50 },
}

describe('canvasStore buildingCards', () => {
  beforeEach(() => {
    useCanvasStore.setState({ buildingCards: [] })
  })

  it('starts with no building cards', () => {
    expect(useCanvasStore.getState().buildingCards).toHaveLength(0)
  })

  it('adds a building card', () => {
    useCanvasStore.getState().addBuildingCard(card)
    expect(useCanvasStore.getState().buildingCards).toHaveLength(1)
    expect(useCanvasStore.getState().buildingCards[0].buildId).toBe('test-build-1')
  })

  it('updates a building card by buildId', () => {
    useCanvasStore.getState().addBuildingCard(card)
    useCanvasStore.getState().updateBuildingCard('test-build-1', { phase: 'plan', componentName: 'WeatherWidget' })
    const updated = useCanvasStore.getState().buildingCards[0]
    expect(updated.phase).toBe('plan')
    expect(updated.componentName).toBe('WeatherWidget')
  })

  it('removes a building card by buildId', () => {
    useCanvasStore.getState().addBuildingCard(card)
    useCanvasStore.getState().removeBuildingCard('test-build-1')
    expect(useCanvasStore.getState().buildingCards).toHaveLength(0)
  })

  it('update on unknown buildId is a no-op', () => {
    useCanvasStore.getState().addBuildingCard(card)
    useCanvasStore.getState().updateBuildingCard('nope', { phase: 'done' })
    expect(useCanvasStore.getState().buildingCards[0].phase).toBe('think')
  })
})
