export type BuildPhase = 'think' | 'plan' | 'build' | 'test' | 'done'

export interface BuildingTask {
  file: string        // e.g. "ui.tsx", "hooks/useWeather.ts"
  assignment: string  // human-readable: "Main view with city search"
  status: 'pending' | 'building' | 'done'
}

export interface BuildingCard {
  buildId: string          // equals tabId from agent:run
  phase: BuildPhase
  componentName?: string   // populated from agent:build:plan
  description?: string     // populated from agent:build:plan
  tasks: BuildingTask[]    // populated from agent:build:plan
  partialBundle?: string   // populated from agent:build:partial
  partialSource?: string   // fallback when bundle fails
  placement: {
    x: number
    y: number
    width: number
  }
}
