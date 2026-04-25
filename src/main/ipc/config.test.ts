import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConfigStore } from '../lib/store'

// Mock electron-store
const storeData = new Map<string, unknown>()
vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def?: unknown) { return storeData.has(key) ? storeData.get(key) : def }
    set(key: string, val: unknown) { storeData.set(key, val) }
  }
}))

// Mock electron safeStorage
const mockEncrypt = vi.fn((s: string) => Buffer.from(`enc:${s}`))
const mockDecrypt = vi.fn((b: Buffer) => b.toString().replace(/^enc:/, ''))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: mockEncrypt,
    decryptString: mockDecrypt,
  }
}))

beforeEach(() => {
  storeData.clear()
  vi.clearAllMocks()
})

const { getConfigValue, setConfigValue, SENSITIVE_KEYS } = await import('./config')

describe('SENSITIVE_KEYS', () => {
  it('includes llmApiKey and serverApiKey', () => {
    expect(SENSITIVE_KEYS.has('llmApiKey')).toBe(true)
    expect(SENSITIVE_KEYS.has('serverApiKey')).toBe(true)
  })

  it('does not include non-sensitive keys', () => {
    expect(SENSITIVE_KEYS.has('theme')).toBe(false)
    expect(SENSITIVE_KEYS.has('llmProvider')).toBe(false)
  })
})

describe('setConfigValue + getConfigValue (non-sensitive)', () => {
  it('round-trips a theme value', () => {
    setConfigValue('theme', 'midnight')
    expect(getConfigValue('theme')).toBe('midnight')
  })

  it('round-trips llmProvider', () => {
    setConfigValue('llmProvider', 'openai')
    expect(getConfigValue('llmProvider')).toBe('openai')
  })

  it('round-trips llmModel', () => {
    setConfigValue('llmModel', 'gpt-4o')
    expect(getConfigValue('llmModel')).toBe('gpt-4o')
  })

  it('round-trips llmFastModel', () => {
    setConfigValue('llmFastModel', 'gpt-4o-mini')
    expect(getConfigValue('llmFastModel')).toBe('gpt-4o-mini')
  })

  it('does NOT call safeStorage for non-sensitive keys', () => {
    setConfigValue('theme', 'light')
    expect(mockEncrypt).not.toHaveBeenCalled()
    getConfigValue('theme')
    expect(mockDecrypt).not.toHaveBeenCalled()
  })
})

describe('setConfigValue + getConfigValue (sensitive)', () => {
  it('encrypts llmApiKey on set', () => {
    setConfigValue('llmApiKey', 'sk-ant-abc123')
    expect(mockEncrypt).toHaveBeenCalledWith('sk-ant-abc123')
  })

  it('decrypts llmApiKey on get', () => {
    setConfigValue('llmApiKey', 'sk-ant-abc123')
    const result = getConfigValue('llmApiKey')
    expect(result).toBe('sk-ant-abc123')
    expect(mockDecrypt).toHaveBeenCalled()
  })

  it('returns null for unset sensitive key', () => {
    expect(getConfigValue('llmApiKey')).toBeNull()
  })

  it('encrypts serverApiKey on set', () => {
    setConfigValue('serverApiKey', 'cslate-key-xyz')
    const result = getConfigValue('serverApiKey')
    expect(result).toBe('cslate-key-xyz')
  })
})
