import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { CanvasComponent, Placement } from '../../store/canvasStore'
import { DynamicComponent } from '../../sandbox/DynamicComponent'
import { useAutoSize } from '../hooks/useAutoSize'
import type { PlacementWithId } from '../lib/collision'
import type { ComponentLayout } from '../../../shared/blueprintTypes'

const GRID_PX = 8

interface Props {
  component: CanvasComponent
  isSelected: boolean
  onSelect: (id: string) => void
  onRemove: (componentId: string) => void
  allPlacements: PlacementWithId[]
  onUpdatePlacement: (componentId: string, placement: Placement) => void
}

export function CanvasItem({ component, isSelected, onSelect, onRemove, allPlacements, onUpdatePlacement }: Props) {
  const { x, y, width, height } = component.placement

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.componentId,
    data: { placement: component.placement },
  })

  const layout = (component.manifest as { layout?: ComponentLayout } | null)?.layout
  const autoSize = useAutoSize(
    component.componentId,
    component.placement,
    {
      enabled: layout?.autoSize !== false,
      minWidth: layout?.minWidth ?? 10,
      minHeight: layout?.minHeight ?? 6,
      maxWidth: layout?.maxWidth,
      maxHeight: layout?.maxHeight,
    },
    allPlacements,
    onUpdatePlacement,
  )

  const style: React.CSSProperties = {
    left: x * GRID_PX,
    top: y * GRID_PX,
    width: width * GRID_PX,
    height: height * GRID_PX,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        'absolute bg-surface rounded-lg shadow-lg overflow-hidden',
        isSelected ? 'ring-2 ring-primary' : '',
        isDragging ? 'shadow-2xl opacity-85' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={() => onSelect(component.componentId)}
    >
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
    </div>
  )
}
