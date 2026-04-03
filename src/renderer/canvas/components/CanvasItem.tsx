import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { CanvasComponent, Placement } from '../../store/canvasStore'
import { DynamicComponent } from '../../sandbox/DynamicComponent'
import { useAutoSize } from '../hooks/useAutoSize'
import { useResize, type ResizeDirection } from '../hooks/useResize'
import { ResizeHandle } from './ResizeHandle'
import type { PlacementWithId } from '../lib/collision'
import type { ComponentLayout } from '../../../shared/blueprintTypes'

const GRID_PX = 8

const ALL_DIRECTIONS: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

const DEFAULT_BREAKPOINTS = [
  { name: 'Mobile', width: 48, height: 80 },
  { name: 'Tablet', width: 96, height: 80 },
  { name: 'Desktop', width: 160, height: 100 },
]

interface Props {
  component: CanvasComponent
  isSelected: boolean
  onSelect: (id: string) => void
  onRemove: (componentId: string) => void
  allPlacements: PlacementWithId[]
  onUpdatePlacement: (componentId: string, placement: Placement) => void
}

export function CanvasItem({ component, isSelected, onSelect, onRemove, allPlacements, onUpdatePlacement }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.componentId,
    data: { placement: component.placement },
  })

  const layout = (component.manifest as { layout?: ComponentLayout } | null)?.layout

  const resizeConstraints = {
    minWidth: layout?.minWidth ?? 10,
    minHeight: layout?.minHeight ?? 6,
    maxWidth: layout?.maxWidth,
    maxHeight: layout?.maxHeight,
    preferredAspectRatio: layout?.preferredAspectRatio,
  }

  const breakpoints = layout?.breakpoints ?? DEFAULT_BREAKPOINTS

  const resize = useResize(
    component.componentId,
    component.placement,
    resizeConstraints,
    breakpoints,
    allPlacements,
    onUpdatePlacement,
  )

  const autoSize = useAutoSize(
    component.componentId,
    component.placement,
    {
      enabled: layout?.autoSize !== false && !resize.isResizing,
      minWidth: layout?.minWidth ?? 10,
      minHeight: layout?.minHeight ?? 6,
      maxWidth: layout?.maxWidth,
      maxHeight: layout?.maxHeight,
    },
    allPlacements,
    onUpdatePlacement,
  )

  // Use tentative placement during resize, otherwise committed placement
  const activePlacement = resize.tentativePlacement ?? component.placement
  const { x, y, width, height } = activePlacement

  const style: React.CSSProperties = {
    left: x * GRID_PX,
    top: y * GRID_PX,
    width: width * GRID_PX,
    height: height * GRID_PX,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : resize.isResizing ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        'absolute bg-surface rounded-lg shadow-lg overflow-hidden',
        isSelected ? 'ring-2 ring-primary' : '',
        isDragging ? 'shadow-2xl opacity-85' : '',
        resize.isResizing ? 'ring-2 ring-primary shadow-2xl' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={() => onSelect(component.componentId)}
    >
      {/* Dimension label during resize */}
      {resize.isResizing && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] text-muted whitespace-nowrap z-20 select-none">
          {width} x {height}
        </div>
      )}

      {/* Drag handle */}
      <div
        className="h-6 flex items-center gap-1.5 px-2 bg-surface-hover/50 cursor-grab active:cursor-grabbing select-none"
        {...listeners}
        {...attributes}
      >
        {/* Grip dots */}
        <svg width="8" height="14" viewBox="0 0 8 14" className="text-muted/40 shrink-0">
          <circle cx="2" cy="2" r="1" fill="currentColor" />
          <circle cx="6" cy="2" r="1" fill="currentColor" />
          <circle cx="2" cy="7" r="1" fill="currentColor" />
          <circle cx="6" cy="7" r="1" fill="currentColor" />
          <circle cx="2" cy="12" r="1" fill="currentColor" />
          <circle cx="6" cy="12" r="1" fill="currentColor" />
        </svg>
        <span className="text-[10px] text-muted/50 truncate leading-none">
          {component.componentId}
        </span>
        <button
          className="ml-auto p-0.5 rounded hover:bg-error/20 hover:text-error text-muted/40 transition-colors"
          title="Remove component"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(component.componentId)
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>

      {/* Component content */}
      <div className="overflow-hidden" style={{ height: height * GRID_PX - 24 }}>
        <div ref={autoSize.contentRef} className="w-full h-full">
          <DynamicComponent bundle={component.bundle} />
        </div>
      </div>

      {/* Resize handles — visible when selected and not dragging */}
      {isSelected && !isDragging && ALL_DIRECTIONS.map((dir) => (
        <ResizeHandle
          key={dir}
          direction={dir}
          onPointerDown={resize.onPointerDown}
          onPointerMove={resize.onPointerMove}
          onPointerUp={resize.onPointerUp}
        />
      ))}

      {/* Detent label when snapped to breakpoint */}
      {resize.isResizing && resize.detent && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-primary/90 text-white rounded text-[10px] whitespace-nowrap z-20 select-none">
          {resize.detent.name}
        </div>
      )}
    </div>
  )
}
