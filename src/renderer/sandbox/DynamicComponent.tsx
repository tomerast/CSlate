import React, { useEffect, useState } from 'react'
import { ComponentError } from './ComponentError'

interface Props {
  code: string
}

interface CompileResult {
  Component: React.ComponentType | null
  error: string | null
}

let babelPromise: Promise<typeof import('@babel/standalone')> | null = null

function getBabel() {
  if (!babelPromise) babelPromise = import('@babel/standalone')
  return babelPromise
}

async function compileCode(code: string): Promise<CompileResult> {
  try {
    const babelModule = await getBabel()
    const Babel = (babelModule as unknown as { default: typeof babelModule }).default ?? babelModule
    const result = Babel.transform(code, { presets: ['react'] })
    if (!result?.code) return { Component: null, error: 'Babel produced no output' }

    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'React',
      'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback', 'useContext',
      `${result.code}\n; return typeof Component !== 'undefined' ? Component : null;`
    )
    const Component = factory(
      React,
      React.useState, React.useEffect, React.useRef,
      React.useMemo, React.useCallback, React.useContext
    )
    if (typeof Component !== 'function') {
      return {
        Component: null,
        error: 'Code did not define a Component function. Make sure your code contains: function Component() { ... }'
      }
    }
    return { Component, error: null }
  } catch (e) {
    return { Component: null, error: `Failed to compile: ${String(e)}` }
  }
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError(e: Error): void },
  { caught: boolean }
> {
  state = { caught: false }
  static getDerivedStateFromError() { return { caught: true } }
  componentDidCatch(e: Error) { this.props.onError(e) }
  render() { return this.state.caught ? null : this.props.children }
}

export function DynamicComponent({ code }: Props) {
  const [result, setResult] = useState<CompileResult>({ Component: null, error: null })
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  useEffect(() => {
    setRuntimeError(null)
    compileCode(code).then(setResult)
  }, [code])

  if (result.error) return <ComponentError message={result.error} code={code} />
  if (runtimeError) return <ComponentError message={`Runtime error: ${runtimeError}`} code={code} />
  if (!result.Component) return null

  return (
    <ErrorBoundary onError={(e) => setRuntimeError(e.message)}>
      <result.Component />
    </ErrorBoundary>
  )
}
