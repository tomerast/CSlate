import { contextBridge, ipcRenderer } from 'electron'
import {
  ALLOWED_SEND_CHANNELS,
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_LISTEN_CHANNELS
} from './channels'
import type { SendChannel, InvokeChannel, ListenChannel } from './channels'

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
