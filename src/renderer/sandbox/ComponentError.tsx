import React from 'react'

interface Props {
  message: string
  code?: string
}

export function ComponentError({ message, code }: Props) {
  return (
    <div className="p-4 bg-error/10 border border-error/30 rounded-md max-w-md">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-error flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <span className="text-error text-sm font-medium">Component error</span>
      </div>
      <p className="text-error/80 text-xs font-mono break-words">{message}</p>
      {code && (
        <details className="mt-2">
          <summary className="text-muted text-xs cursor-pointer">Show code</summary>
          <pre className="mt-1 text-xs text-muted overflow-auto max-h-32 bg-background rounded p-2">{code}</pre>
        </details>
      )}
    </div>
  )
}

export default ComponentError
