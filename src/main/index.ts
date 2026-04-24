import { app, BrowserWindow, ipcMain, nativeImage, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { register as registerConfig } from './ipc/config'
import { register as registerFile } from './ipc/file'
import { register as registerWindow } from './ipc/window'
import { register as registerAgent } from './agent/ipc'
import { register as registerServer } from './ipc/server'
import { register as registerShell } from './ipc/shell'
import { register as registerModels } from './ipc/models'
import { register as registerPipeline } from './ipc/pipeline'
import { register as registerSession } from './ipc/session'
import { register as registerMemory } from './ipc/memory'
import { createWindow } from './windowManager'

function installCSP(): void {
  const serverUrl = process.env['CSLATE_SERVER_URL'] ?? 'http://localhost:3000'
  const connectSrc = is.dev
    ? `'self' ${serverUrl} ws://localhost:5173 ws://localhost:5174`
    : `'self' ${serverUrl}`

  // 'unsafe-eval' is required for DynamicComponent which evaluates CJS bundles via new Function().
  // Dev mode also needs 'unsafe-inline' for Vite's React Refresh/HMR inline scripts.
  const scriptSrc = is.dev ? `'self' 'unsafe-inline' 'unsafe-eval'` : `'self' 'unsafe-eval'`

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
  const iconPath = is.dev
    ? join(__dirname, '../../resources/icon.png')
    : join(process.resourcesPath, 'icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  installCSP()
  registerConfig(ipcMain)
  registerFile(ipcMain)
  registerWindow(ipcMain)
  registerAgent(ipcMain)
  registerServer(ipcMain)
  registerShell(ipcMain)
  registerModels(ipcMain)
  registerPipeline(ipcMain)
  registerSession(ipcMain)
  registerMemory(ipcMain)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
