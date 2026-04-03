import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuildingCard } from '../canvas/building/types'

export interface Placement {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasComponent {
  componentId: string
  bundle: string
  placement: Placement
  manifest: unknown
}

export interface CanvasPreview {
  bundle: string
  files: Record<string, string>
  manifest: unknown
  placement?: Partial<Placement>
}

interface CanvasState {
  components: CanvasComponent[]
  preview: CanvasPreview | null
  buildingCards: BuildingCard[]

  hydrate(components: CanvasComponent[]): void
  addComponent(comp: CanvasComponent): void
  removeComponent(componentId: string): void
  updatePlacement(componentId: string, placement: Placement): void
  setPreview(preview: CanvasPreview): void
  clearPreview(): void
  addBuildingCard(card: BuildingCard): void
  updateBuildingCard(buildId: string, patch: Partial<Omit<BuildingCard, 'buildId'>>): void
  removeBuildingCard(buildId: string): void
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<string, Placement>()
function debouncedPersistPlacement(componentId: string, placement: Placement) {
  pendingUpdates.set(componentId, placement)
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    for (const [id, p] of pendingUpdates) {
      window.electron.invoke('canvas:update-placement', { componentId: id, placement: p })
    }
    pendingUpdates.clear()
    persistTimer = null
  }, 500)
}

export const useCanvasStore = create<CanvasState>()(persist((set) => ({
  components: [],
  preview: null,
  buildingCards: [],

  hydrate: (components) => set({ components }),

  addComponent: (comp) => set((s) => ({
    components: [
      ...s.components.filter(c => c.componentId !== comp.componentId),
      comp,
    ],
  })),

  removeComponent: (componentId) => set((s) => ({
    components: s.components.filter(c => c.componentId !== componentId),
  })),

  updatePlacement: (componentId, placement) => {
    set((s) => ({
      components: s.components.map(c =>
        c.componentId === componentId ? { ...c, placement } : c
      ),
    }))
    debouncedPersistPlacement(componentId, placement)
  },

  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),

  addBuildingCard: (card) => set((s) => ({
    buildingCards: [...s.buildingCards, card],
  })),

  updateBuildingCard: (buildId, patch) => set((s) => ({
    buildingCards: s.buildingCards.map(c =>
      c.buildId === buildId ? { ...c, ...patch } : c
    ),
  })),

  removeBuildingCard: (buildId) => set((s) => ({
    buildingCards: s.buildingCards.filter(c => c.buildId !== buildId),
  })),
}), {
  name: 'canvas-store',
  partialize: (s) => ({ preview: s.preview, components: s.components }),
}))
