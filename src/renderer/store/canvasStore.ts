import { create } from 'zustand'

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
  placement?: Placement
}

interface CanvasState {
  components: CanvasComponent[]
  preview: CanvasPreview | null

  hydrate(components: CanvasComponent[]): void
  addComponent(comp: CanvasComponent): void
  removeComponent(componentId: string): void
  setPreview(preview: CanvasPreview): void
  clearPreview(): void
}

export const useCanvasStore = create<CanvasState>((set) => ({
  components: [],
  preview: null,

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

  setPreview: (preview) => set({ preview }),
  clearPreview: () => set({ preview: null }),
}))
