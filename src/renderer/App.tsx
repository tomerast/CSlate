import React from 'react'

export default function App(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-text mb-2">CSlate</h1>
        <p className="text-muted text-sm">Your Slate is ready. Press ⌘K to begin.</p>
      </div>
    </div>
  )
}
