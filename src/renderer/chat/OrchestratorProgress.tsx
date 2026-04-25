import { parseModelId } from '../lib/modelParser'
import type { OrchestratorPhase, OrchestratorStatus } from '../store/chatStore'
import { ModelSpeedVisual } from '../components/ModelSpeedVisual'

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

export function OrchestratorProgress({ status, modelId }: { status: OrchestratorStatus; modelId: string }) {
  const phase = status.currentPhase
  if (!phase) return null

  const meta = parseModelId(modelId)
  const providerColor = meta.color

  const userPhase = mapPhase(phase)
  const info = PHASE_INFO[userPhase]

  const showDeterminate =
    phase === 'worker' && status.workerTotal > 0 && status.workerDone > 0
  const progress = showDeterminate
    ? Math.round((status.workerDone / status.workerTotal) * 100)
    : null

  const overallPct = (() => {
    if (userPhase === 'thinking') return 15
    if (userPhase === 'finishing') return 95
    if (progress !== null) return 30 + Math.round((progress / 100) * 50)
    return 40
  })()

  return (
    <div className="msg-enter w-full max-w-[520px] mx-auto">
      <div
        className="
          rounded-2xl border border-white/[0.055] bg-white/[0.026] backdrop-blur-xl p-4
          relative overflow-hidden shadow-[0_12px_42px_rgba(0,0,0,0.20)]
        "
      >
        <div className="relative flex items-center gap-3">
          <div className="relative h-5 w-5 shrink-0">
            <div className="absolute inset-0 rounded-full border border-white/[0.08]" />
            <div
              className="absolute inset-0 rounded-full border animate-spin"
              style={{ borderColor: 'transparent', borderTopColor: providerColor }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text">{info.title}</div>
            <div className="mt-0.5 text-xs text-muted/50">{info.line}</div>
          </div>
          <div className="hidden sm:block rounded-full border border-white/[0.05] bg-white/[0.022] px-2 py-1 text-[10px] text-muted/42">
            {meta.displayName}
          </div>
        </div>

        <div className="mt-3 h-1 rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${overallPct}%`, backgroundColor: providerColor }}
          />
        </div>

        <ModelSpeedVisual
          telemetry={status.telemetry}
          providerColor={providerColor}
        />
      </div>
    </div>
  )
}
