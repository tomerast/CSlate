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

  // Stabilize tryGrow via refs to avoid ResizeObserver disconnect/reconnect churn
  // when placement or allPlacements change (which happens on every drag/resize).
  const placementRef = useRef(placement)
  placementRef.current = placement
  const allPlacementsRef = useRef(allPlacements)
  allPlacementsRef.current = allPlacements
  const configRef = useRef(config)
  configRef.current = config

  const tryGrow = useCallback(
    (contentWidth: number, contentHeight: number) => {
      const cfg = configRef.current
      const pl = placementRef.current
      const neededW = Math.max(cfg.minWidth, Math.ceil(contentWidth / GRID_PX))
      const neededH = Math.max(cfg.minHeight, Math.ceil(contentHeight / GRID_PX))
      const targetW = cfg.maxWidth ? Math.min(neededW, cfg.maxWidth) : neededW
      const targetH = cfg.maxHeight ? Math.min(neededH, cfg.maxHeight) : neededH

      // Grow only
      const newW = Math.max(pl.width, targetW)
      const newH = Math.max(pl.height, targetH)

      if (newW === pl.width && newH === pl.height) return

      // Collision check
      const candidate: Placement = { x: pl.x, y: pl.y, width: newW, height: newH }
      const others = allPlacementsRef.current.filter((p) => p.id !== componentId)
      if (checkCollision(candidate, others, GUTTER).collides) return

      onUpdate(componentId, candidate)
    },
    [componentId, onUpdate],
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
