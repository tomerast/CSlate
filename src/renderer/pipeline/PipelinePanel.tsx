import React from 'react'
import { usePipelineStore } from '../store/pipelineStore'

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400',
  running: 'text-green-400',
  polling: 'text-green-400',
  streaming: 'text-blue-400',
  inactive: 'text-muted',
  stopped: 'text-muted',
  error: 'text-red-400',
  idle: 'text-yellow-400',
}

export function PipelinePanel() {
  const pipelines = usePipelineStore((s) => s.pipelines)

  const handleStart = async (pipelineId: string) => {
    await window.electron.invoke('pipeline:start', { pipelineId })
  }

  const handleStop = async (pipelineId: string) => {
    await window.electron.invoke('pipeline:stop', { pipelineId })
  }

  if (pipelines.length === 0) {
    return (
      <div className="p-4 text-muted text-sm">
        No data pipelines yet. The agent will create them when your components need external data.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-text font-medium text-sm">Data Pipelines</h3>
      {pipelines.map((p) => {
        const runtimeState = p.runtimeStatus?.state ?? p.status
        const colorClass = STATUS_COLORS[runtimeState] ?? 'text-muted'

        return (
          <div
            key={p.pipelineId}
            className="bg-surface rounded-lg p-3 border border-border"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-text text-sm font-medium">{p.pipelineId}</span>
                <span className={`ml-2 text-xs ${colorClass}`}>{runtimeState}</span>
              </div>
              <div className="flex gap-1">
                {runtimeState === 'stopped' || runtimeState === 'inactive' ? (
                  <button
                    onClick={() => handleStart(p.pipelineId)}
                    className="text-xs px-2 py-1 rounded bg-primary text-white hover:opacity-80"
                  >
                    Start
                  </button>
                ) : runtimeState !== 'error' ? (
                  <button
                    onClick={() => handleStop(p.pipelineId)}
                    className="text-xs px-2 py-1 rounded bg-surface border border-border text-muted hover:text-text"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleStart(p.pipelineId)}
                    className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>

            {p.connectedComponents.length > 0 && (
              <div className="mt-1 text-xs text-muted">
                Connected: {p.connectedComponents.join(', ')}
              </div>
            )}

            {p.runtimeStatus?.lastError && (
              <div className="mt-1 text-xs text-red-400 truncate">
                {p.runtimeStatus.lastError}
              </div>
            )}

            {p.lastRun && (
              <div className="mt-1 text-xs text-muted">
                Last run: {new Date(p.lastRun).toLocaleTimeString()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
