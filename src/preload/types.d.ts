export {}

declare global {
  interface Window {
    electron: {
      send: (channel: string, data?: unknown) => void
      invoke: (channel: string, data?: unknown) => Promise<unknown>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
      platform: NodeJS.Platform
      isDev: boolean
    }
  }
}
