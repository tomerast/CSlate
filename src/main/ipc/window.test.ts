import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.2.3') },
  BrowserWindow: { getFocusedWindow: vi.fn() },
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

  it('does nothing when there is no focused window', () => {
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)

    expect(() => setWindowTitle('No Window')).not.toThrow()
    expect(BrowserWindow.getFocusedWindow).toHaveBeenCalledOnce()
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
