import { app, BrowserWindow, ipcMain, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { register as registerConfig } from './ipc/config'
import { register as registerProject } from './ipc/project'
import { register as registerFile } from './ipc/file'
import { register as registerWindow } from './ipc/window'
import { register as registerAgent } from './agent/ipc'
import { createWindow } from './windowManager'

function installCSP(): void {
  const serverUrl = process.env['CSLATE_SERVER_URL'] ?? 'http://localhost:3000'
  const connectSrc = is.dev
    ? `'self' ${serverUrl} ws://localhost:5173 ws://localhost:5174`
    : `'self' ${serverUrl}`

  // Dev mode: Vite's @vitejs/plugin-react injects inline scripts for React Refresh/HMR.
  // These require 'unsafe-inline' for script-src. Production builds have no inline scripts.
  const scriptSrc = is.dev ? `'self' 'unsafe-inline'` : `'self'`

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:`
        ]
      }
    })
  })
}

app.whenReady().then(() => {
  installCSP()
  registerConfig(ipcMain)
  registerProject(ipcMain)
  registerFile(ipcMain)
  registerWindow(ipcMain)
  registerAgent(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
