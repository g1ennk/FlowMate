import type { TaskItem } from '../reviewTypes'
import { ReviewTaskLabel } from './ReviewTaskLabel'

type IncompleteTasksProps = {
  items: TaskItem[]
  onSelect?: (item: TaskItem) => void
  showDate?: boolean
  formatDateLabel?: (date: string) => string
  getHoverDetails?: (item: TaskItem) => string[]
  className?: string
}

export function IncompleteTasks({
  items,
  onSelect,
  showDate = false,
  formatDateLabel = (date) => date,
  getHoverDetails,
  className = '',
}: IncompleteTasksProps) {
  return (
    <div className={`rounded-2xl bg-surface-card p-4 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold text-amber-600">미완료</h3>
      <div className="mt-3 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-sm text-text-tertiary">모두 마무리했어요.</p>
        ) : (
          items.map((item) => {
            const hoverDetails = getHoverDetails?.(item) ?? []
            const hoverText = hoverDetails.join('\n')
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect?.(item)}
                title={hoverText || undefined}
                className="group relative flex w-full items-center justify-between rounded-xl border border-border-subtle px-3 py-2 text-left transition hover:bg-hover"
              >
                <div className="min-w-0">
                  <ReviewTaskLabel
                    task={item}
                    wrapperClassName="min-w-0 inline-flex max-w-full flex-wrap items-center gap-2"
                    titleClassName="truncate text-sm font-medium text-text-primary"
                  />
                  {showDate && (
                    <p className="mt-0.5 text-[11px] text-text-tertiary">{formatDateLabel(item.date)}</p>
                  )}
                </div>
                {item.focusSeconds >= 60 && (
                  <span className="ml-2 shrink-0 text-[11px] font-semibold text-text-secondary">
                    {item.focusTime}
                  </span>
                )}
                {hoverText && (
                  <span className="pointer-events-none absolute -top-8 right-2 z-10 max-w-64 rounded-md bg-timer-focus-bg px-2 py-1 text-[11px] font-medium whitespace-pre-wrap text-text-inverse opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {hoverText}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
