import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    value: {
      invoke: vi.fn().mockResolvedValue(null),
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
  it('renders without crashing', async () => {
    const { default: App } = await import('../App')
    const { container } = render(React.createElement(App))
    expect(container.firstChild).toBeTruthy()
  })
})
