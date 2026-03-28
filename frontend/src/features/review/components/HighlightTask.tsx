import type { HighlightTask as HighlightTaskType } from '../reviewTypes'
import { ReviewTaskLabel } from './ReviewTaskLabel'

type HighlightTaskProps = {
  title: string
  task: HighlightTaskType | null
}

export function HighlightTask({ title, task }: HighlightTaskProps) {
  return (
    <div className="rounded-2xl bg-surface-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-3">
        {task ? (
          <div className="rounded-xl bg-accent-subtle px-4 py-3">
            <ReviewTaskLabel
              task={task}
              titleClassName="text-sm font-semibold text-accent-text"
            />
            <p className="mt-1 text-xs text-accent-text">
              {task.focusTime} 몰입
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">아직 집중 기록이 없어요.</p>
        )}
      </div>
    </div>
  )
}
