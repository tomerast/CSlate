import React from 'react'
import type { OrchestratorPhase, OrchestratorStatus, ToolCallEntry } from '../store/chatStore'

const PHASES: OrchestratorPhase[] = [
  'understand',
  'search',
  'plan',
  'dispatch',
  'worker',
  'validate',
  'ship',
]

const PHASE_META: Record<OrchestratorPhase, { label: string; description: string; icon: string }> = {
  understand: {
    label: 'Understand',
    description: 'Analyzing your request',
    icon: '🔍',
  },
  search: {
    label: 'Search',
    description: 'Searching community library',
    icon: '📚',
  },
  plan: {
    label: 'Plan',
    description: 'Designing the architecture',
    icon: '📐',
  },
  dispatch: {
    label: 'Dispatch',
    description: 'Recruiting build agents',
    icon: '🚀',
  },
  worker: {
    label: 'Build',
    description: 'Writing code files',
    icon: '⚡',
  },
  validate: {
    label: 'Validate',
    description: 'Compiling & validating',
    icon: '✓',
  },
  ship: {
    label: 'Ship',
    description: 'Rendering inline',
    icon: '🎨',
  },
  fix: {
    label: 'Polish',
    description: 'Refining details',
    icon: '✨',
  },
}

function PhaseDot({
  phase,
  state,
  isActive,
}: {
  phase: OrchestratorPhase
  state: 'past' | 'active' | 'future'
  isActive: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 relative">
      <div
        className={`
          relative w-2.5 h-2.5 rounded-full transition-all duration-500
          ${state === 'past' ? 'bg-primary/60' : ''}
          ${state === 'active' ? 'bg-primary orchestrator-active-glow orchestrator-pulse-ring' : ''}
          ${state === 'future' ? 'bg-border' : ''}
        `}
      />
      <span
        className={`
          text-[9px] uppercase tracking-widest transition-colors duration-300
          ${state === 'active' ? 'text-primary font-medium' : ''}
          ${state === 'past' ? 'text-muted/50' : ''}
          ${state === 'future' ? 'text-muted/20' : ''}
        `}
      >
        {PHASE_META[phase].label}
      </span>
    </div>
  )
}

function PhaseTrack({ status }: { status: OrchestratorStatus }) {
  const currentIndex = status.currentPhase ? PHASES.indexOf(status.currentPhase) : -1

  return (
    <div className="flex items-start justify-between px-2">
      {PHASES.map((phase, i) => {
        let state: 'past' | 'active' | 'future'
        if (i < currentIndex) state = 'past'
        else if (i === currentIndex) state = 'active'
        else state = 'future'

        return (
          <React.Fragment key={phase}>
            <PhaseDot phase={phase} state={state} isActive={state === 'active'} />
            {i < PHASES.length - 1 && (
              <div className="flex-1 h-px mt-[5px] mx-1">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    background:
                      state === 'past'
                        ? 'var(--slate-primary)'
                        : state === 'active'
                        ? 'linear-gradient(90deg, var(--slate-primary) 0%, transparent 100%)'
                        : 'var(--slate-border)',
                    opacity: state === 'future' ? 0.3 : 0.5,
                  }}
                />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function ToolCallRow({ call }: { call: ToolCallEntry }) {
  const icon =
    call.status === 'running' ? (
      <div className="w-3 h-3 rounded-full border border-primary/40 border-t-primary animate-spin" />
    ) : call.status === 'done' ? (
      <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )

  return (
    <div className="flex items-center gap-2 py-0.5">
      {icon}
      <span className="text-[10px] text-muted/70 font-mono truncate">{call.name}</span>
      {call.detail && <span className="text-[10px] text-muted/40 truncate">{call.detail}</span>}
    </div>
  )
}

function WorkerBadge({ total, done }: { total: number; done: number }) {
  if (total <= 0) return null
  const pct = Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1 rounded-full bg-border/50 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/70 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted/60 tabular-nums">
        {done}/{total} files
      </span>
    </div>
  )
}

export function OrchestratorProgress({ status }: { status: OrchestratorStatus }) {
  const phase = status.currentPhase
  if (!phase) return null

  const meta = PHASE_META[phase]
  const recentTools = status.toolCalls.slice(-5)

  return (
    <div className="msg-enter w-full max-w-xl">
      <div
        className="
          rounded-xl border border-primary/10 bg-surface/80 backdrop-blur-sm
          orchestrator-active-glow overflow-hidden
        "
      >
        {/* Shimmer overlay */}
        <div className="orchestrator-shimmer absolute inset-0 pointer-events-none" />

        <div className="relative px-4 py-3.5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="relative w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-sm">{meta.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-text leading-tight">{meta.description}</div>
              <div className="text-[10px] text-muted/50 mt-0.5">CSlate Agent is building your component</div>
            </div>
          </div>

          {/* Phase track */}
          <div className="mb-3">
            <PhaseTrack status={status} />
          </div>

          {/* Worker progress */}
          {phase === 'worker' && <WorkerBadge total={status.workerTotal} done={status.workerDone} />}

          {/* Recent tool calls */}
          {recentTools.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <div className="space-y-0.5">
                {recentTools.map((call, i) => (
                  <ToolCallRow key={`${call.name}-${call.timestamp}-${i}`} call={call} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
