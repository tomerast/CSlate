import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    value: {
      invoke: vi.fn().mockResolvedValue(null), // null = no API key stored
      platform: 'darwin',
      isDev: false,
      send: vi.fn(),
      on: vi.fn().mockReturnValue(() => {})
    },
    writable: true,
    configurable: true
  })
  vi.resetModules()
})

describe('App', () => {
  it('shows ApiKeySetup when no API key is stored', async () => {
    const { default: App } = await import('../App')
    render(React.createElement(App))
    await vi.waitFor(() => {
      expect(screen.getByText(/Welcome to CSlate/i)).toBeTruthy()
    })
  })
})
