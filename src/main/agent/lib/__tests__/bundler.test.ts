import { describe, it, expect } from 'vitest'
import { bundleComponentFiles } from '../bundler'

describe('bundleComponentFiles', () => {
  it('bundles a single-file component with default export', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': 'export default function App() { return null }',
    })
    expect(bundle).toContain('exports')
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string) => {
      if (mod === 'react') return { createElement: () => null }
      throw new Error(`unexpected require: ${mod}`)
    }
    new Function('require', 'module', 'exports', bundle)(_require, _module, _module.exports)
    expect(typeof _module.exports['default']).toBe('function')
  })

  it('resolves relative imports between files', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `
        import { greeting } from './utils/greet'
        export default function App() { return greeting }
      `,
      'utils/greet.ts': `export const greeting = 'hello'`,
    })
    const _module = { exports: {} as Record<string, unknown> }
    const _require = (mod: string) => {
      if (mod === 'react') return {}
      throw new Error(`unexpected require: ${mod}`)
    }
    new Function('require', 'module', 'exports', bundle)(_require, _module, _module.exports)
    expect(typeof _module.exports['default']).toBe('function')
  })

  it('resolves imports without file extensions', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import { x } from './data'\nexport default function App() { return x }`,
      'data.ts': `export const x = 42`,
    })
    expect(bundle).toBeTruthy()
  })

  it('resolves index files', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import { x } from './hooks'\nexport default function App() { return x }`,
      'hooks/index.ts': `export const x = 42`,
    })
    expect(bundle).toBeTruthy()
  })

  it('externalizes react', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import React from 'react'\nexport default function App() { return React.createElement('div') }`,
    })
    expect(bundle).toContain('require')
    expect(bundle).toContain('react')
  })

  it('handles TypeScript generics and types', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `
        interface Props<T extends string> { value: T }
        export default function App(props: Props<string>) { return null }
      `,
    })
    expect(bundle).toBeTruthy()
  })

  it('throws on missing import', async () => {
    await expect(
      bundleComponentFiles({
        'ui.tsx': `import { x } from './missing'\nexport default function App() { return x }`,
      })
    ).rejects.toThrow()
  })

  it('chains deep imports: ui → hooks → utils', async () => {
    const bundle = await bundleComponentFiles({
      'ui.tsx': `import { useData } from './hooks/useData'\nexport default function App() { return useData() }`,
      'hooks/useData.ts': `import { format } from '../utils/format'\nexport function useData() { return format(42) }`,
      'utils/format.ts': `export function format(n: number) { return String(n) }`,
    })
    expect(bundle).toBeTruthy()
  })
})
