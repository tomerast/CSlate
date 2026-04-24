import { useMemo } from 'react'
import type { OrchestratorPhase, OrchestratorStatus } from '../store/chatStore'

type UserPhase = 'thinking' | 'building' | 'finishing'

const PHASE_INFO: Record<UserPhase, { title: string; line: string }> = {
  thinking: {
    title: 'Thinking it through',
    line: 'Figuring out the best approach...',
  },
  building: {
    title: 'Building your component',
    line: 'Writing the code and putting it together...',
  },
  finishing: {
    title: 'Wrapping up',
    line: 'Checking everything and getting it ready...',
  },
}

function mapPhase(phase: OrchestratorPhase): UserPhase {
  switch (phase) {
    case 'understand':
    case 'search':
    case 'plan':
      return 'thinking'
    case 'dispatch':
    case 'worker':
      return 'building'
    case 'validate':
    case 'ship':
    case 'fix':
    default:
      return 'finishing'
  }
}

export function OrchestratorProgress({ status }: { status: OrchestratorStatus }) {
  const phase = status.currentPhase
  if (!phase) return null

  const userPhase = mapPhase(phase)
  const info = PHASE_INFO[userPhase]

  // Only show a determinate bar while workers are actively finishing up.
  // Otherwise keep it indeterminate — simpler and less jittery.
  const showDeterminate =
    phase === 'worker' && status.workerTotal > 0 && status.workerDone > 0
  const progress = showDeterminate
    ? Math.round((status.workerDone / status.workerTotal) * 100)
    : null

  // Rough overall progress across the 3 conceptual phases
  const overallPct = useMemo(() => {
    if (userPhase === 'thinking') return 15
    if (userPhase === 'finishing') return 95
    if (progress !== null) return 30 + Math.round((progress / 100) * 50)
    return 40
  }, [userPhase, progress])

  return (
    <div className="msg-enter w-full max-w-md">
      <div className="rounded-xl border border-border/30 bg-surface/50 backdrop-blur-sm p-4">
        <div className="flex items-center gap-3">
          {/* Clean spinner */}
          <div className="relative w-5 h-5 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text">{info.title}</div>
            <div className="text-xs text-muted/50 mt-0.5">{info.line}</div>
          </div>
        </div>

        {/* Smooth progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-border/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/70 transition-all duration-700 ease-out"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
