import { app, BrowserWindow, ipcMain, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { register as registerConfig } from './ipc/config'
import { register as registerProject } from './ipc/project'
import { register as registerFile } from './ipc/file'
import { register as registerWindow } from './ipc/window'
import { createWindow } from './windowManager'

function installCSP(): void {
  const serverUrl = process.env['CSLATE_SERVER_URL'] ?? 'http://localhost:3000'
  const connectSrc = is.dev
    ? `'self' ${serverUrl} ws://localhost:5173`
    : `'self' ${serverUrl}`

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:`
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
