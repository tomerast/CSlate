import React, { useCallback, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useCanvasStore } from '../store/canvasStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'
import { BuildingCard } from './building/BuildingCard'
import { CanvasItem } from './components/CanvasItem'
import { SnapGuideOverlay } from './components/SnapGuideOverlay'
import { useSnapGuides, applySnap } from './hooks/useSnapGuides'
import { clampDragPosition, clampToBounds, type PlacementWithId } from './lib/collision'

const GRID_PX = 8
const SNAP_THRESHOLD = 1 // grid units
const COLLISION_GUTTER = 1 // grid units

export function SlateCanvas() {
  const components = useCanvasStore((s) => s.components)
  const preview = useCanvasStore((s) => s.preview)
  const buildingCards = useCanvasStore((s) => s.buildingCards)
  const updatePlacement = useCanvasStore((s) => s.updatePlacement)
  const removeComponent = useCanvasStore((s) => s.removeComponent)

  const shortcut = window.electron.platform === 'darwin' ? '⌘K' : 'Ctrl+K'
  const isEmpty = components.length === 0 && !preview && buildingCards.length === 0

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const { activeGuides, updateGuides, clearGuides } = useSnapGuides()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const allPlacements: PlacementWithId[] = components.map((c) => ({
    id: c.componentId,
    ...c.placement,
  }))

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { active, delta } = event
      const placement = active.data.current?.placement as
        | { x: number; y: number; width: number; height: number }
        | undefined
      if (!placement) return

      const tentativeX = placement.x + Math.round(delta.x / GRID_PX)
      const tentativeY = placement.y + Math.round(delta.y / GRID_PX)

      const others = allPlacements.filter((p) => p.id !== active.id)
      updateGuides(
        { x: tentativeX, y: tentativeY, width: placement.width, height: placement.height },
        others,
        SNAP_THRESHOLD,
      )
    },
    [allPlacements, updateGuides],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event
      const placement = active.data.current?.placement as
        | { x: number; y: number; width: number; height: number }
        | undefined
      if (!placement) {
        clearGuides()
        return
      }

      const tentativeX = placement.x + Math.round(delta.x / GRID_PX)
      const tentativeY = placement.y + Math.round(delta.y / GRID_PX)

      // Compute snap guides for the tentative position
      const others = allPlacements.filter((p) => p.id !== active.id)
      const guides = updateGuides(
        { x: tentativeX, y: tentativeY, width: placement.width, height: placement.height },
        others,
        SNAP_THRESHOLD,
      )

      // Apply snap alignment
      const snapped = applySnap(
        { x: tentativeX, y: tentativeY },
        { width: placement.width, height: placement.height },
        guides,
        SNAP_THRESHOLD,
      )

      // Clamp with collision detection, then bounds
      const final = clampDragPosition(
        { ...snapped, width: placement.width, height: placement.height },
        allPlacements,
        COLLISION_GUTTER,
        String(active.id),
        placement,
      )
      const bounded = clampToBounds(final)

      updatePlacement(String(active.id), {
        x: bounded.x,
        y: bounded.y,
        width: placement.width,
        height: placement.height,
      })

      clearGuides()
    },
    [allPlacements, updatePlacement, updateGuides, clearGuides],
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
  }, [])

  const handleRemove = useCallback((componentId: string) => {
    window.electron.invoke('canvas:remove-component', { componentId, deleteFiles: false })
    removeComponent(componentId)
    setSelectedId((prev) => (prev === componentId ? null : prev))
  }, [removeComponent])

  // Deselect when clicking canvas background
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedId(null)
    }
  }, [])

  const canvasWidth = canvasRef.current?.scrollWidth ?? 0
  const canvasHeight = canvasRef.current?.scrollHeight ?? 0

  return (
    <div
      ref={canvasRef}
      className="flex-1 bg-background relative overflow-auto"
      onClick={handleCanvasClick}
    >
      {isEmpty ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center select-none">
            <img
              src={new URL('../assets/logo.png', import.meta.url).href}
              alt=""
              className="h-12 w-auto mx-auto mb-4 opacity-20"
              draggable={false}
            />
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
        <DndContext
          sensors={sensors}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          {components.map((comp) => (
            <CanvasItem
              key={comp.componentId}
              component={comp}
              isSelected={selectedId === comp.componentId}
              onSelect={handleSelect}
              onRemove={handleRemove}
              allPlacements={allPlacements}
              onUpdatePlacement={updatePlacement}
            />
          ))}

          {buildingCards.map((card) => (
            <BuildingCard key={card.buildId} card={card} />
          ))}

          {preview && (
            <div
              className="absolute bg-surface rounded-lg shadow-lg overflow-auto ring-2 ring-primary/30"
              style={
                preview.placement?.x != null
                  ? {
                      left: preview.placement.x * GRID_PX,
                      top: (preview.placement.y ?? 0) * GRID_PX,
                      width: (preview.placement.width ?? 4) * GRID_PX,
                      height: (preview.placement.height ?? 4) * GRID_PX,
                    }
                  : {
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      maxWidth: '80%',
                      minHeight: '300px',
                    }
              }
            >
              <DynamicComponent bundle={preview.bundle} />
            </div>
          )}

          <SnapGuideOverlay
            guides={activeGuides}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        </DndContext>
      )}
    </div>
  )
}
