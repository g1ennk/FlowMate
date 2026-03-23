import { CheckIcon } from '../../../ui/Icons'
import type { TaskItem } from '../reviewTypes'
import { ReviewTaskLabel } from './ReviewTaskLabel'

type TimelineTaskItemProps = {
  item: TaskItem
  dateLabel?: string
  onSelect?: (item: TaskItem) => void
}

export function TimelineTaskItem({ item, dateLabel, onSelect }: TimelineTaskItemProps) {
  const isDone = item.isDone
  const timeLabel = item.focusSeconds >= 60 ? item.focusTime : '-'

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(item) : undefined}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left"
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-gray-300 bg-white'
        }`}
      >
        {isDone && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
      </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            {dateLabel && (
              <span className="text-[11px] font-medium text-gray-400">
                {dateLabel}
              </span>
            )}
            <ReviewTaskLabel
              task={item}
              wrapperClassName="min-w-0 inline-flex max-w-full flex-wrap items-center gap-2"
              titleClassName="truncate text-sm text-gray-900"
            />
          </div>
        </div>
      <span className="text-[11px] text-gray-400">{timeLabel}</span>
    </button>
  )
}
