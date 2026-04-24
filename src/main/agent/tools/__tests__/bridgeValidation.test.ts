import { describe, expect, it } from 'vitest'
import { validateBridgeDataUsage, validateBridgeFetchReferences } from '../bridgeValidation'

describe('bridgeValidation', () => {
  const manifest = {
    dataSources: {
      coingecko: {
        endpoints: {
          getSimplePrice: { path: '/simple/price', method: 'GET' },
        },
      },
    },
  }

  it('accepts bridge.fetch calls that reference declared endpoint ids', () => {
    const errors = validateBridgeFetchReferences({
      'ui.tsx': "await bridge.fetch('coingecko', 'getSimplePrice', {})",
    }, manifest)

    expect(errors).toEqual([])
  })

  it('rejects bridge.fetch calls that use endpoint paths instead of endpoint ids', () => {
    const errors = validateBridgeFetchReferences({
      'ui.tsx': "await bridge.fetch('coingecko', 'simple/price', {})",
    }, manifest)

    expect(errors).toEqual([
      'ui.tsx: bridge.fetch references missing endpoint "coingecko/simple/price". Available endpoints: getSimplePrice',
    ])
  })

  it('rejects bridge.fetch calls that reference missing data sources', () => {
    const errors = validateBridgeFetchReferences({
      'ui.tsx': 'await bridge.fetch("weather", "current", {})',
    }, manifest)

    expect(errors).toEqual([
      'ui.tsx: bridge.fetch references missing data source "weather"',
    ])
  })

  it('rejects live data cards that fetch once without polling or subscribing', () => {
    const errors = validateBridgeDataUsage({
      'ui.tsx': "await bridge.fetch('coingecko', 'getSimplePrice', {})",
    }, {
      ...manifest,
      name: 'Bitcoin Ticker',
      description: 'Real-time Bitcoin price tracker',
      tags: ['bitcoin', 'ticker'],
    })

    expect(errors).toEqual([
      'Data-backed live/current components must poll or subscribe; a one-time bridge.fetch plus manual refresh is not enough',
    ])
  })

  it('accepts live data cards that poll', () => {
    const errors = validateBridgeDataUsage({
      'ui.tsx': `
        await bridge.fetch('coingecko', 'getSimplePrice', {})
        window.setInterval(refresh, 60000)
      `,
    }, {
      ...manifest,
      name: 'Bitcoin Ticker',
      description: 'Real-time Bitcoin price tracker',
      tags: ['bitcoin', 'ticker'],
    })

    expect(errors).toEqual([])
  })
})
