// src/renderer/canvas/building/PhaseStrip.tsx
import React from 'react'
import type { BuildPhase } from './types'

const PHASES: { key: BuildPhase; label: string }[] = [
  { key: 'think', label: 'Think' },
  { key: 'plan', label: 'Plan' },
  { key: 'build', label: 'Build' },
  { key: 'test', label: 'Test' },
  { key: 'done', label: 'Done' },
]

const PHASE_ORDER: BuildPhase[] = ['think', 'plan', 'build', 'test', 'done']

function phaseIndex(phase: BuildPhase): number {
  return PHASE_ORDER.indexOf(phase)
}

interface Props {
  phase: BuildPhase
}

export function PhaseStrip({ phase }: Props) {
  const current = phaseIndex(phase)

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((p, i) => {
        const isDone = i < current
        const isActive = i === current

        return (
          <React.Fragment key={p.key}>
            <div className="flex items-center gap-1">
              <div
                className={[
                  'w-1.5 h-1.5 rounded-full transition-all duration-300',
                  isDone ? 'bg-primary' : '',
                  isActive ? 'bg-primary/80 animate-pulse' : '',
                  !isDone && !isActive ? 'bg-border' : '',
                ].join(' ')}
              />
              <span
                className={[
                  'text-[10px] transition-colors duration-300',
                  isDone ? 'text-primary/60' : '',
                  isActive ? 'text-primary' : '',
                  !isDone && !isActive ? 'text-muted/40' : '',
                ].join(' ')}
              >
                {p.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div
                className={[
                  'flex-1 h-px min-w-[8px] transition-colors duration-300',
                  i < current ? 'bg-primary/40' : 'bg-border/40',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
