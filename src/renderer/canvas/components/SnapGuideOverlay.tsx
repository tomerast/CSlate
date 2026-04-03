import React from 'react'
import type { SnapGuide } from '../hooks/useSnapGuides'

const GRID_PX = 8

interface Props {
  guides: SnapGuide[]
  canvasHeight: number
  canvasWidth: number
}

export function SnapGuideOverlay({ guides, canvasHeight, canvasWidth }: Props) {
  if (guides.length === 0) return null
  return (
    <>
      {guides.map((guide, i) => {
        if (guide.axis === 'x') {
          return (
            <div
              key={`${guide.axis}-${guide.position}-${i}`}
              className="absolute top-0 w-px bg-blue-400/50 pointer-events-none"
              style={{ left: guide.position * GRID_PX, height: canvasHeight }}
            />
          )
        }
        return (
          <div
            key={`${guide.axis}-${guide.position}-${i}`}
            className="absolute left-0 h-px bg-blue-400/50 pointer-events-none"
            style={{ top: guide.position * GRID_PX, width: canvasWidth }}
          />
        )
      })}
    </>
  )
}
