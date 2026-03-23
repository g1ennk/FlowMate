import type { HighlightTask as HighlightTaskType } from '../reviewTypes'
import { ReviewTaskLabel } from './ReviewTaskLabel'

type HighlightTaskProps = {
  title: string
  task: HighlightTaskType | null
}

export function HighlightTask({ title, task }: HighlightTaskProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="mt-3">
        {task ? (
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <ReviewTaskLabel
              task={task}
              titleClassName="text-sm font-semibold text-emerald-800"
            />
            <p className="mt-1 text-xs text-emerald-700">
              {task.focusTime} 몰입
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">아직 집중 기록이 없어요.</p>
        )}
      </div>
    </div>
  )
}
