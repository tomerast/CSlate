import { create } from 'zustand'

interface PipelineEntry {
  pipelineId: string
  status: 'active' | 'inactive' | 'error'
  lastRun?: number
  error?: string
  connectedComponents: string[]
  runtimeStatus?: {
    state: string
    lastError?: string
    uptimeMs?: number
  } | null
}

interface PipelineState {
  pipelines: PipelineEntry[]

  hydrate: (pipelines: PipelineEntry[]) => void
  addPipeline: (entry: PipelineEntry) => void
  removePipeline: (pipelineId: string) => void
  updatePipeline: (pipelineId: string, patch: Partial<PipelineEntry>) => void
  updateRuntimeStatus: (pipelineId: string, status: PipelineEntry['runtimeStatus']) => void
}

export const usePipelineStore = create<PipelineState>((set) => ({
  pipelines: [],

  hydrate: (pipelines) => set({ pipelines }),

  addPipeline: (entry) =>
    set((state) => ({
      pipelines: [...state.pipelines.filter((p) => p.pipelineId !== entry.pipelineId), entry],
    })),

  removePipeline: (pipelineId) =>
    set((state) => ({
      pipelines: state.pipelines.filter((p) => p.pipelineId !== pipelineId),
    })),

  updatePipeline: (pipelineId, patch) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.pipelineId === pipelineId ? { ...p, ...patch } : p,
      ),
    })),

  updateRuntimeStatus: (pipelineId, status) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.pipelineId === pipelineId ? { ...p, runtimeStatus: status } : p,
      ),
    })),
}))
