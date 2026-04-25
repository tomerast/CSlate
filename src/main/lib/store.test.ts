import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-store with an in-memory Map
const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data = storeData
      private defaults: Record<string, unknown>

      constructor(options: { name: string; defaults: Record<string, unknown> }) {
        this.defaults = options.defaults
        // Initialize defaults
        for (const [key, value] of Object.entries(options.defaults)) {
          if (!this.data.has(key)) {
            this.data.set(key, value)
          }
        }
      }

      get(key: string, defaultValue?: unknown): unknown {
        if (this.data.has(key)) {
          return this.data.get(key)
        }
        return defaultValue !== undefined ? defaultValue : this.defaults[key]
      }

      set(key: string, value: unknown): void {
        this.data.set(key, value)
      }
    }
  }
})

// Mock electron (app.getPath not needed for store tests)
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

beforeEach(() => {
  storeData.clear()
})

// Import after mocks are set up
const { configStore, windowStore } = await import('./store')

describe('configStore', () => {
  it('returns default llmProvider', () => {
    expect(configStore.get('llmProvider')).toBe('anthropic')
  })

  it('returns default theme', () => {
    expect(configStore.get('theme')).toBe('dark')
  })

  it('returns default fast model', () => {
    expect(configStore.get('llmFastModel')).toBe('anthropic/claude-haiku-4-5')
  })

  it('returns default serverUrl', () => {
    expect(configStore.get('serverUrl')).toBe('https://api.cslate.app')
  })

  it('returns default empty recentProjects', () => {
    expect(configStore.get('recentProjects')).toEqual([])
  })

  it('persists and retrieves a set value', () => {
    configStore.set('theme', 'midnight')
    expect(configStore.get('theme')).toBe('midnight')
  })
})

describe('windowStore', () => {
  it('returns default width', () => {
    expect(windowStore.get('width')).toBe(1280)
  })

  it('returns default height', () => {
    expect(windowStore.get('height')).toBe(800)
  })

  it('returns default isMaximized false', () => {
    expect(windowStore.get('isMaximized')).toBe(false)
  })

  it('persists window bounds', () => {
    windowStore.set('width', 1440)
    windowStore.set('height', 900)
    expect(windowStore.get('width')).toBe(1440)
    expect(windowStore.get('height')).toBe(900)
  })
})
