import React from 'react'
import type { BuildingCard as BuildingCardType } from './types'
import { PhaseStrip } from './PhaseStrip'
import { PhraseRotator } from './PhraseRotator'
import { TaskRow } from './TaskRow'
import { PartialPreview } from './PartialPreview'

const GRID_PX = 8

interface Props {
  card: BuildingCardType
}

export function BuildingCard({ card }: Props) {
  const { x, y, width } = card.placement
  const activeTask = card.tasks.find(t => t.status === 'building')

  const showTaskList = card.tasks.length > 0 && (card.phase === 'build' || card.phase === 'test')

  const phraseContext = {
    componentName: card.componentName,
    file: activeTask?.file,
    task: activeTask?.assignment,
  }

  return (
    <div
      className="absolute bg-surface rounded-lg shadow-lg border border-border/40 overflow-hidden"
      style={{
        left: x * GRID_PX,
        top: y * GRID_PX,
        width: width * GRID_PX,
      }}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Phase strip */}
        <PhaseStrip phase={card.phase} />

        {/* Component name + phrase */}
        <div className="flex flex-col gap-0.5">
          {card.componentName && (
            <p className="text-sm font-medium text-text leading-tight">
              {card.componentName}
            </p>
          )}
          <PhraseRotator phase={card.phase} context={phraseContext} />
        </div>

        {/* Task rows (build phase: individual rows; test phase: summary) */}
        {showTaskList && (
          <div className="flex flex-col gap-0.5">
            {card.phase === 'build' ? (
              card.tasks.map(task => (
                <TaskRow key={task.file} task={task} />
              ))
            ) : (
              <p className="text-xs text-muted/60">
                {card.tasks.length} file{card.tasks.length !== 1 ? 's' : ''} assembled...
              </p>
            )}
          </div>
        )}

        {/* Partial preview */}
        {(card.partialBundle || card.partialSource) && (
          <PartialPreview bundle={card.partialBundle} source={card.partialSource} />
        )}
      </div>
    </div>
  )
}
