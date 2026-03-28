export type SendChannel = 'bridge:fetch' | 'bridge:subscribe' | 'bridge:unsubscribe' | 'sandbox:load' | 'sandbox:unload'
export type InvokeChannel = 'bridge:fetch' | 'config:get' | 'config:set' | 'file:read' | 'file:write'
export type ListenChannel = 'bridge:fetch:resp' | 'bridge:event' | 'sandbox:load:resp' | 'sandbox:error'

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
