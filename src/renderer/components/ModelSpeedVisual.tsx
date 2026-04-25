import { useMemo } from 'react'
import type { BuildTelemetry } from '../store/chatStore'
import { parseModelId } from '../lib/modelParser'

interface ModelSpeedVisualProps {
  telemetry: BuildTelemetry[]
  providerColor: string
}

function speedLabel(tokPerSec: number): string {
  const wps = Math.max(1, Math.round(tokPerSec * 0.75))
  if (tokPerSec >= 100) return `Almost instant - ${wps} words/sec`
  if (tokPerSec >= 50) return `Swift - ${wps} words/sec`
  if (tokPerSec >= 20) return `Thinking it through - ${wps} words/sec`
  if (tokPerSec >= 5) return `Taking its time - ${wps} words/sec`
  if (tokPerSec > 0) return `Deep in thought - ${wps} words/sec`
  return ''
}

function speedColor(tokPerSec: number, fallback: string): string {
  if (tokPerSec >= 50) return '#34D399' // emerald
  if (tokPerSec >= 20) return fallback // provider accent
  if (tokPerSec >= 5) return '#F59E0B' // amber
  if (tokPerSec > 0) return '#EF4444' // red
  return '#6B7280' // gray
}

function statusLabel(t: BuildTelemetry): string {
  if (t.status === 'timeout') return 'This model needed more time'
  if (t.status === 'error') return 'Something went wrong'
  if (t.status === 'success') {
    const ms = t.durationMs
    if (ms < 5000) return 'Done in a flash'
    if (ms < 15000) return 'Done'
    return `Done in ${(ms / 1000).toFixed(1)}s`
  }
  return ''
}

export function ModelSpeedVisual({ telemetry, providerColor }: ModelSpeedVisualProps) {
  const completed = useMemo(() => telemetry.filter((t) => t.status !== 'running'), [telemetry])
  const running = useMemo(() => telemetry.filter((t) => t.status === 'running'), [telemetry])

  if (running.length === 0 && completed.length === 0) return null

  const latest = completed[completed.length - 1] ?? running[running.length - 1]
  if (!latest) return null

  const tokPerSec = latest.tokPerSec ?? 0
  const color = speedColor(tokPerSec, providerColor)
  const label = speedLabel(tokPerSec)
  const status = statusLabel(latest)

  return (
    <div className="mt-3 space-y-2 msg-enter">
      <div className="flex items-center gap-3">
        <div className="relative w-2 h-2 shrink-0">
          <div className="absolute inset-0 rounded-full opacity-40 animate-ping"
            style={{ backgroundColor: color }}
          />
          <div className="absolute inset-0 rounded-full" style={{ backgroundColor: color }} />
        </div>

        <div className="flex-1 min-w-0">
          {label ? (
            <div className="text-[11px] text-muted/60 leading-tight">
              {label}
            </div>
          ) : null}
          {status ? (
            <div className="text-[10px] text-muted/30 mt-0.5 leading-tight">
              {status}
            </div>
          ) : null}
        </div>

        <div className="hidden sm:block shrink-0 text-right">
          <div className="text-[9px] uppercase tracking-wide text-muted/22">worker</div>
          <div className="max-w-[132px] truncate text-[10px] text-muted/38 font-mono">
            {latest.displayModel}
          </div>
        </div>
      </div>

      {running.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {running.map((t) => {
            const meta = parseModelId(t.modelId)
            return (
              <div key={t.file} className="flex-1 min-w-0">
                <div className="text-[9px] text-muted/24 mb-0.5 truncate">{t.file}</div>
                <div className="h-[2px] rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full animate-pulse"
                    style={{
                      width: '60%',
                      backgroundColor: meta.color || providerColor,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {completed.slice(-3).map((t) => (
            <div key={t.file} className="flex items-center gap-1">
              <span
                className="text-[9px] font-mono"
                style={{ color: t.status === 'timeout' ? '#F59E0B' : t.status === 'error' ? '#EF4444' : '#34D399' }}
              >
                {t.status === 'timeout' ? '!' : t.status === 'error' ? 'x' : 'ok'}
              </span>
              <span className="text-[9px] text-muted/34">{t.file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
