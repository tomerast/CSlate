import { useMemo } from 'react'
import { useAppStore, getProviderMeta } from '../store/appStore'
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

  const activeProvider = useAppStore((s) => s.activeProvider)
  const providerColor = getProviderMeta(activeProvider).color

  const userPhase = mapPhase(phase)
  const info = PHASE_INFO[userPhase]

  const showDeterminate =
    phase === 'worker' && status.workerTotal > 0 && status.workerDone > 0
  const progress = showDeterminate
    ? Math.round((status.workerDone / status.workerTotal) * 100)
    : null

  const overallPct = useMemo(() => {
    if (userPhase === 'thinking') return 15
    if (userPhase === 'finishing') return 95
    if (progress !== null) return 30 + Math.round((progress / 100) * 50)
    return 40
  }, [userPhase, progress])

  return (
    <div className="msg-enter w-full max-w-md mx-auto">
      <div
        className="
          rounded-xl border border-white/[0.06] bg-surface/60 backdrop-blur-sm p-4
          relative overflow-hidden
        "
      >
        {/* Subtle provider glow */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-20 rounded-full blur-2xl opacity-20 pointer-events-none"
          style={{ backgroundColor: providerColor }}
        />

        <div className="relative flex items-center gap-3">
          <div className="relative w-5 h-5 shrink-0">
            <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: `${providerColor}25` }} />
            <div
              className="absolute inset-0 rounded-full border-2 animate-spin"
              style={{ borderColor: 'transparent', borderTopColor: providerColor }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text">{info.title}</div>
            <div className="text-xs text-muted/50 mt-0.5">{info.line}</div>
          </div>
        </div>

        <div className="mt-3 h-1 rounded-full bg-white/[0.04] overflow-hidden"
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${overallPct}%`, backgroundColor: providerColor }}
          />
        </div>
      </div>
    </div>
  )
}
