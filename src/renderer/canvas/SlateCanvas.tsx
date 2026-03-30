import React from 'react'
import { useChatStore } from '../store/chatStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'

export function SlateCanvas() {
  const currentCode = useChatStore((s) => s.currentCode)
  const shortcut = window.electron?.platform === 'darwin' ? '⌘K' : 'Ctrl+K'

  return (
    <div className="flex-1 bg-background relative overflow-hidden">
      {!currentCode ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center select-none">
            <p className="text-muted text-base font-medium">Your Slate canvas</p>
            <p className="text-muted/60 text-sm mt-1">
              Press{' '}
              <kbd className="px-1.5 py-0.5 bg-surface border border-border text-muted rounded text-xs">
                {shortcut}
              </kbd>
              {' '}to describe a component
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="bg-surface rounded-lg shadow-lg overflow-auto max-w-full max-h-full">
            <DynamicComponent code={currentCode} />
          </div>
        </div>
      )}
    </div>
  )
}

export default SlateCanvas
