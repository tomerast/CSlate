import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.2.3') },
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn() }
}))

import { app, BrowserWindow, ipcMain } from 'electron'
import { getAppVersion, setWindowTitle, register } from './window'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(app.getVersion).mockReturnValue('1.2.3')
})

describe('getAppVersion', () => {
  it('returns the value from app.getVersion()', () => {
    const version = getAppVersion()
    expect(version).toBe('1.2.3')
    expect(app.getVersion).toHaveBeenCalledOnce()
  })
})

describe('setWindowTitle', () => {
  it('calls setTitle on the focused window', () => {
    const mockWindow = { setTitle: vi.fn() }
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(mockWindow as any)

    setWindowTitle('My Title')

    expect(BrowserWindow.getFocusedWindow).toHaveBeenCalledOnce()
    expect(mockWindow.setTitle).toHaveBeenCalledWith('My Title')
  })

  it('falls back to first window when there is no focused window', () => {
    const fallbackWindow = { setTitle: vi.fn() }
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    vi.mocked((BrowserWindow as any).getAllWindows).mockReturnValue([fallbackWindow])

    setWindowTitle('No Focus')

    expect(BrowserWindow.getFocusedWindow).toHaveBeenCalledOnce()
    expect((BrowserWindow as any).getAllWindows).toHaveBeenCalledOnce()
    expect(fallbackWindow.setTitle).toHaveBeenCalledWith('No Focus')
  })

  it('does nothing when there are no windows at all', () => {
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    vi.mocked((BrowserWindow as any).getAllWindows).mockReturnValue([])

    expect(() => setWindowTitle('Ghost')).not.toThrow()
  })
})

describe('register', () => {
  it('registers both app:get-version and window:set-title handlers', () => {
    register(ipcMain as any)

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel)
    expect(registeredChannels).toContain('app:get-version')
    expect(registeredChannels).toContain('window:set-title')
    expect(ipcMain.handle).toHaveBeenCalledTimes(2)
  })
})
