import { useEffect, useRef, useCallback } from 'react'
import type { Placement } from '../../store/canvasStore'
import { checkCollision, type PlacementWithId } from '../lib/collision'

const GRID_PX = 8
const GUTTER = 2
const DEBOUNCE_MS = 200

interface AutoSizeConfig {
  enabled: boolean
  minWidth: number
  minHeight: number
  maxWidth?: number
  maxHeight?: number
}

export function useAutoSize(
  componentId: string,
  placement: Placement,
  config: AutoSizeConfig,
  allPlacements: PlacementWithId[],
  onUpdate: (componentId: string, placement: Placement) => void,
) {
  const contentRef = useRef<HTMLDivElement>(null)
  const hasInitialized = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const tryGrow = useCallback(
    (contentWidth: number, contentHeight: number) => {
      const neededW = Math.max(config.minWidth, Math.ceil(contentWidth / GRID_PX))
      const neededH = Math.max(config.minHeight, Math.ceil(contentHeight / GRID_PX))
      const targetW = config.maxWidth ? Math.min(neededW, config.maxWidth) : neededW
      const targetH = config.maxHeight ? Math.min(neededH, config.maxHeight) : neededH

      // Grow only
      const newW = Math.max(placement.width, targetW)
      const newH = Math.max(placement.height, targetH)

      if (newW === placement.width && newH === placement.height) return

      // Collision check
      const candidate: Placement = { x: placement.x, y: placement.y, width: newW, height: newH }
      const others = allPlacements.filter((p) => p.id !== componentId)
      if (checkCollision(candidate, others, GUTTER).collides) return

      onUpdate(componentId, candidate)
    },
    [componentId, placement, config, allPlacements, onUpdate],
  )

  useEffect(() => {
    if (!config.enabled || !contentRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect

      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        if (!hasInitialized.current) {
          hasInitialized.current = true
        }
        tryGrow(width, height)
      }, DEBOUNCE_MS)
    })

    observer.observe(contentRef.current)

    return () => {
      observer.disconnect()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [config.enabled, tryGrow])

  return { contentRef }
}
