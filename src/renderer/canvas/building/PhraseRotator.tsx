// src/renderer/canvas/building/PhraseRotator.tsx
import React from 'react'
import type { BuildPhase } from './types'
import { pickPhrase, type PhraseContext } from './phrases'

interface Props {
  phase: BuildPhase
  context: PhraseContext
}

export function PhraseRotator({ phase, context }: Props) {
  const [phrase, setPhrase] = React.useState(() => pickPhrase(phase, context))
  const [visible, setVisible] = React.useState(true)

  // Re-pick when phase or active file changes
  React.useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setPhrase(pickPhrase(phase, context))
      setVisible(true)
    }, 150)
    return () => clearTimeout(t)
  }, [phase, context.file, context.componentName])

  // Rotate every 4 seconds during long phases
  React.useEffect(() => {
    if (phase === 'done') return
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setPhrase(pickPhrase(phase, context))
        setVisible(true)
      }, 150)
    }, 4000)
    return () => clearInterval(interval)
  }, [phase, context.file, context.componentName])

  return (
    <p
      className="text-sm text-muted transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {phrase}
    </p>
  )
}
