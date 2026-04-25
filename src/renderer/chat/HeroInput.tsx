import { useState, useRef, useEffect, useCallback } from 'react'
import { parseModelId } from '../lib/modelParser'

interface HeroInputProps {
  onSubmit: (text: string) => void | Promise<void>
  modelId: string | undefined
  isGenerating?: boolean
  suggestions?: string[]
}

const defaultSuggestions = [
  'Compare today\'s market movers',
  'Plan a calm week',
  'Map the decision in front of me',
]

export function HeroInput({
  onSubmit,
  modelId,
  isGenerating,
  suggestions = defaultSuggestions,
}: HeroInputProps) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const meta = parseModelId(modelId)

  const sendText = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || isGenerating) return
    await onSubmit(trimmed)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [isGenerating, onSubmit])

  const handleSend = useCallback(async () => {
    await sendText(text)
  }, [sendText, text])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [text])

  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, handleSend])

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div
        className={`
          w-full rounded-2xl border border-white/[0.065] bg-white/[0.026] backdrop-blur-xl transition-all duration-300 ease-out
          ${focused
            ? 'border-white/[0.12] -translate-y-0.5'
            : ''
          }
        `}
        style={{
          boxShadow: focused
            ? `0 16px 48px rgba(0,0,0,0.26), 0 0 26px ${meta.color}12`
            : '0 12px 36px rgba(0,0,0,0.20)',
        }}
      >
        <div className="px-4 pt-3.5 pb-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask anything..."
            className="w-full bg-transparent text-[15px] text-text placeholder:text-muted/42 outline-none resize-none leading-relaxed"
            disabled={isGenerating}
          />
        </div>

        {suggestions.length > 0 && !text && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); void sendText(s) }}
                className="
                  text-[11px] text-muted/66 hover:text-text
                  px-2.5 py-1 rounded-full bg-white/[0.026] hover:bg-white/[0.055]
                  border border-white/[0.045] hover:border-white/[0.08]
                  transition-all duration-150 cursor-pointer max-w-full truncate
                "
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="px-3 pb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              title="Attach file"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted/55 hover:text-text hover:bg-white/[0.045] transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.025] text-[11px] px-2 py-0.5 h-6 gap-1"
              title={`${meta.displayName} (${meta.fullId})`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: meta.color }}
              />
              <span className="font-medium text-text truncate max-w-[120px]">{meta.displayName}</span>
            </div>

            <button
              onMouseDown={(e) => { e.preventDefault(); void handleSend() }}
              disabled={!text.trim() || isGenerating}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                transition-all duration-200
                ${text.trim() && !isGenerating
                  ? 'opacity-100 scale-100 hover:scale-105'
                  : 'opacity-40 scale-90'
                }
              `}
              style={{
                backgroundColor: text.trim() && !isGenerating ? meta.color : undefined,
              }}
            >
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
