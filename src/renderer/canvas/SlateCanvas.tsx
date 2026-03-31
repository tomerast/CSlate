import React from 'react'
import { useCanvasStore, type CanvasComponent } from '../store/canvasStore'
import { DynamicComponent } from '../sandbox/DynamicComponent'
import { BuildingCard } from './building/BuildingCard'

const GRID_PX = 8

function CanvasItem({ component }: { component: CanvasComponent }) {
  const { x, y, width, height } = component.placement
  return (
    <div
      className="absolute bg-surface rounded-lg shadow-lg overflow-auto"
      style={{
        left: x * GRID_PX,
        top: y * GRID_PX,
        width: width * GRID_PX,
        height: height * GRID_PX,
      }}
    >
      <DynamicComponent bundle={component.bundle} />
    </div>
  )
}

export function SlateCanvas() {
  const components = useCanvasStore((s) => s.components)
  const preview = useCanvasStore((s) => s.preview)
  const buildingCards = useCanvasStore((s) => s.buildingCards)
  const shortcut = window.electron.platform === 'darwin' ? '⌘K' : 'Ctrl+K'
  const isEmpty = components.length === 0 && !preview && buildingCards.length === 0

  return (
    <div className="flex-1 bg-background relative overflow-auto">
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
        <>
          {components.map((comp) => (
            <CanvasItem key={comp.componentId} component={comp} />
          ))}
          {buildingCards.map((card) => (
            <BuildingCard key={card.buildId} card={card} />
          ))}
          {preview && (
            <div
              className="absolute bg-surface rounded-lg shadow-lg overflow-auto ring-2 ring-primary/30"
              style={preview.placement ? {
                left: preview.placement.x * GRID_PX,
                top: preview.placement.y * GRID_PX,
                width: preview.placement.width * GRID_PX,
                height: preview.placement.height * GRID_PX,
              } : {
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: '80%',
                maxHeight: '80%',
              }}
            >
              <DynamicComponent bundle={preview.bundle} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
