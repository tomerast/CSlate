export interface BridgeAPI {
  fetch: (sourceId: string, endpointId: string, params?: Record<string, unknown>) => Promise<unknown>
  subscribe: (
    sourceId: string,
    endpointId: string,
    params: Record<string, unknown>,
    callback: (data: unknown) => void
  ) => () => void
  getConfig: (key: string) => unknown
}

export function createMockBridge(
  componentName: string,
  userConfig: Record<string, unknown> = {}
): BridgeAPI {
  const timers = new Set<ReturnType<typeof setInterval>>()

  const api: BridgeAPI = {
    async fetch(sourceId, endpointId, params = {}) {
      console.log(`[bridge.fetch] ${sourceId}/${endpointId}`, params)
      return {}
    },

    subscribe(sourceId, endpointId, params, callback) {
      console.log(`[bridge.subscribe] ${sourceId}/${endpointId}`, params)
      api.fetch(sourceId, endpointId, params).then(callback)
      const timer = setInterval(() => {
        api.fetch(sourceId, endpointId, params).then(callback)
      }, 30_000)
      timers.add(timer)
      return () => {
        clearInterval(timer)
        timers.delete(timer)
      }
    },

    getConfig(key) {
      const value = userConfig[key]
      if (value === undefined) {
        console.warn(`[bridge.getConfig] Key "${key}" not found in userConfig for "${componentName}"`)
      }
      return value ?? null
    }
  }

  return api
}
