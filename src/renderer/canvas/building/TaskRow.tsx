// src/renderer/canvas/building/TaskRow.tsx
import React from 'react'
import type { BuildingTask } from './types'

interface Props {
  task: BuildingTask
}

export function TaskRow({ task }: Props) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Status icon */}
      <div className="flex-shrink-0 w-4 flex items-center justify-center">
        {task.status === 'done' && (
          <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        )}
        {task.status === 'building' && (
          <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
        )}
        {task.status === 'pending' && (
          <div className="w-1.5 h-1.5 rounded-full bg-border" />
        )}
      </div>

      {/* Assignment + filename */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className={[
            'text-xs truncate',
            task.status === 'done' ? 'text-muted/60 line-through' : '',
            task.status === 'building' ? 'text-text' : '',
            task.status === 'pending' ? 'text-muted/50' : '',
          ].join(' ')}
        >
          {task.assignment}
        </span>
        <span className="text-[10px] text-muted/40 flex-shrink-0 font-mono">
          {task.file}
        </span>
      </div>
    </div>
  )
}
