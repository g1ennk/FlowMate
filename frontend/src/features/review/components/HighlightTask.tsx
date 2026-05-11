import type { HighlightTask as HighlightTaskType } from '../reviewTypes'

type HighlightTaskProps = {
  title: string
  task: HighlightTaskType | null
}

export function HighlightTask({ title, task }: HighlightTaskProps) {
  return (
    <div className="rounded-2xl bg-surface-card p-card shadow-sm">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-3">
        {task ? (
          <div className="rounded-xl bg-accent-subtle px-4 py-3">
            <span className="text-sm font-semibold text-accent-text">{task.title}</span>
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
