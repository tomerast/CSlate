import { useState, useRef, useEffect, useCallback } from 'react'
import { getProviderMeta, type ProviderId } from '../store/appStore'
import { ProviderLens } from '../components/ProviderLens'

interface HeroInputProps {
  onSubmit: (text: string) => void | Promise<void>
  activeProvider: ProviderId
  onProviderChange: (provider: ProviderId) => void
  isGenerating?: boolean
  suggestions?: string[]
}

const defaultSuggestions = [
  'Build me a stock screener',
  'Visualize my calendar',
  "What's happening in tech today?",
]

export function HeroInput({
  onSubmit,
  activeProvider,
  onProviderChange,
  isGenerating,
  suggestions = defaultSuggestions,
}: HeroInputProps) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const providerMeta = getProviderMeta(activeProvider)

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || isGenerating) return
    await onSubmit(trimmed)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [text, isGenerating, onSubmit])

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
    <div className="w-full flex flex-col items-center gap-5">
      <div
        className={`
          w-full rounded-[20px] bg-surface border transition-all duration-300 ease-out
          ${focused
            ? 'border-white/10 shadow-lg'
            : 'border-white/[0.06] shadow-md'
          }
        `}
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
            className="w-full bg-transparent text-[15px] text-text placeholder:text-muted/40 outline-none resize-none leading-relaxed"
            disabled={isGenerating}
          />
        </div>

        {suggestions.length > 0 && !text && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => { setText(s); void handleSend() }}
                className="
                  text-[11px] text-muted/60 hover:text-text
                  px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06]
                  border border-transparent hover:border-white/[0.06]
                  transition-all duration-150 cursor-pointer
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
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted/50 hover:text-muted hover:bg-white/[0.04] transition-colors"
              onMouseDown={(e) => e.preventDefault()}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ProviderLens
              activeProvider={activeProvider}
              onChange={onProviderChange}
              size="sm"
            />

            <button
              onMouseDown={(e) => { e.preventDefault(); void handleSend() }}
              disabled={!text.trim() || isGenerating}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                transition-all duration-200
                ${text.trim() && !isGenerating
                  ? 'opacity-100 scale-100'
                  : 'opacity-40 scale-90'
                }
              `}
              style={{
                backgroundColor: text.trim() && !isGenerating ? providerMeta.color : undefined,
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
