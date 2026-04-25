import { parseModelId } from '../lib/modelParser'

interface ProviderLensProps {
  modelId: string | undefined
  size?: 'sm' | 'md'
}

export function ProviderLens({ modelId, size = 'md' }: ProviderLensProps) {
  const meta = parseModelId(modelId)

  const pillSize = size === 'sm'
    ? 'text-[11px] px-2 py-0.5 h-6 gap-1'
    : 'text-xs px-2.5 py-1 h-7 gap-1.5'

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <div className="relative">
      <div
        className={`
          inline-flex items-center rounded-full border border-white/[0.055]
          bg-white/[0.025] text-text/88 transition-all duration-200
          ${pillSize}
        `}
        title={`${meta.displayName} (${meta.fullId})`}
      >
        <span
          className={`rounded-full ${dotSize}`}
          style={{ backgroundColor: meta.color, color: meta.color }}
        />
        <span className="font-medium truncate max-w-[120px]">{meta.displayName}</span>
      </div>
    </div>
  )
}
