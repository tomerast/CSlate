import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockWin = {
  maximize: vi.fn(),
  webContents: { openDevTools: vi.fn() },
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  getBounds: vi.fn(() => ({ x: 100, y: 200, width: 1400, height: 900 })),
  isMaximized: vi.fn(() => false),
  on: vi.fn(),
  setTitle: vi.fn()
}

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(() => mockWin),
  app: { getVersion: vi.fn(() => '0.1.0') },
  ipcMain: { handle: vi.fn() }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}))

const mockWindowState = { width: 1280, height: 800, isMaximized: false }
vi.mock('./lib/store', () => ({
  windowStore: {
    get store() {
      return mockWindowState
    },
    set: vi.fn((key: string, value: unknown) => {
      ;(mockWindowState as Record<string, unknown>)[key] = value
    })
  }
}))

describe('windowManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset state to defaults
    mockWindowState.width = 1280
    mockWindowState.height = 800
    mockWindowState.isMaximized = false
    ;(mockWindowState as Record<string, unknown>).x = undefined
    ;(mockWindowState as Record<string, unknown>).y = undefined
  })

  it('createWindow() creates a BrowserWindow with dimensions from windowStore', async () => {
    const { BrowserWindow } = await import('electron')
    mockWindowState.width = 1400
    mockWindowState.height = 900

    const { createWindow } = await import('./windowManager')
    createWindow()

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1400, height: 900 })
    )
  })

  it('createWindow() calls win.maximize() when isMaximized is true in store', async () => {
    mockWindowState.isMaximized = true

    const { createWindow } = await import('./windowManager')
    createWindow()

    expect(mockWin.maximize).toHaveBeenCalled()
  })

  it('createWindow() does NOT call win.maximize() when isMaximized is false', async () => {
    mockWindowState.isMaximized = false

    const { createWindow } = await import('./windowManager')
    createWindow()

    expect(mockWin.maximize).not.toHaveBeenCalled()
  })

  it('createWindow() registers a close event listener on the window', async () => {
    const { createWindow } = await import('./windowManager')
    createWindow()

    expect(mockWin.on).toHaveBeenCalledWith('close', expect.any(Function))
  })

  it('the close handler saves current bounds + isMaximized state to windowStore', async () => {
    const { windowStore } = await import('./lib/store')
    const { createWindow } = await import('./windowManager')
    createWindow()

    // Find the close handler registered via win.on('close', handler)
    const closeCall = (mockWin.on as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === 'close'
    )
    expect(closeCall).toBeDefined()
    const closeHandler = closeCall![1] as () => void

    // Simulate maximized state
    mockWin.isMaximized.mockReturnValue(true)
    mockWin.getBounds.mockReturnValue({ x: 50, y: 60, width: 1600, height: 1000 })

    closeHandler()

    expect(windowStore.set).toHaveBeenCalledWith('x', 50)
    expect(windowStore.set).toHaveBeenCalledWith('y', 60)
    expect(windowStore.set).toHaveBeenCalledWith('width', 1600)
    expect(windowStore.set).toHaveBeenCalledWith('height', 1000)
    expect(windowStore.set).toHaveBeenCalledWith('isMaximized', true)
  })
})
