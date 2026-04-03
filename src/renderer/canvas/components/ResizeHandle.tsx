import React from 'react'
import type { ResizeDirection } from '../hooks/useResize'

interface Props {
  direction: ResizeDirection
  onPointerDown: (e: React.PointerEvent, direction: ResizeDirection) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}

const positionClasses: Record<ResizeDirection, string> = {
  n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
}

export function ResizeHandle({ direction, onPointerDown, onPointerMove, onPointerUp }: Props) {
  return (
    <div
      className={`absolute w-3 h-3 bg-primary/80 border border-white rounded-sm z-10 ${positionClasses[direction]}`}
      onPointerDown={(e) => onPointerDown(e, direction)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
