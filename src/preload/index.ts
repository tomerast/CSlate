import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_SEND_CHANNELS = ['bridge:fetch', 'bridge:subscribe', 'bridge:unsubscribe', 'sandbox:load', 'sandbox:unload'] as const
const ALLOWED_INVOKE_CHANNELS = ['bridge:fetch', 'config:get', 'config:set', 'file:read', 'file:write'] as const
const ALLOWED_LISTEN_CHANNELS = ['bridge:fetch:resp', 'bridge:event', 'sandbox:load:resp', 'sandbox:error'] as const

type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]

contextBridge.exposeInMainWorld('electron', {
  send: (channel: SendChannel, data?: unknown) => {
    if (!(ALLOWED_SEND_CHANNELS as readonly string[]).includes(channel)) return
    ipcRenderer.send(channel, data)
  },
  invoke: (channel: InvokeChannel, data?: unknown) => {
    if (!(ALLOWED_INVOKE_CHANNELS as readonly string[]).includes(channel)) return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    return ipcRenderer.invoke(channel, data)
  },
  on: (channel: ListenChannel, callback: (...args: unknown[]) => void) => {
    if (!(ALLOWED_LISTEN_CHANNELS as readonly string[]).includes(channel)) return () => {}
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development'
})
