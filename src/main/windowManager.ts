import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { windowStore } from './lib/store'

export function createWindow(): BrowserWindow {
  const state = windowStore.store

  const winOptions: Electron.BrowserWindowConstructorOptions = {
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  }

  if (state.x !== undefined && state.y !== undefined) {
    winOptions.x = state.x
    winOptions.y = state.y
  }

  const win = new BrowserWindow(winOptions)

  if (state.isMaximized) {
    win.maximize()
  }

  win.on('close', () => {
    if (!win.isMaximized()) {
      const bounds = win.getBounds()
      windowStore.set('x', bounds.x)
      windowStore.set('y', bounds.y)
      windowStore.set('width', bounds.width)
      windowStore.set('height', bounds.height)
    }
    windowStore.set('isMaximized', win.isMaximized())
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (is.dev) {
    win.webContents.openDevTools()
  }

  return win
}
