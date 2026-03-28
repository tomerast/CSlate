import type { SendChannel, InvokeChannel, ListenChannel } from './channels'

declare global {
  interface Window {
    electron: {
      send: (channel: SendChannel, data?: unknown) => void
      invoke: (channel: InvokeChannel, data?: unknown) => Promise<unknown>
      on: (channel: ListenChannel, callback: (...args: unknown[]) => void) => () => void
      platform: NodeJS.Platform
      isDev: boolean
    }
  }
}
