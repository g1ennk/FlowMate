import type { TaskItem } from '../reviewTypes'
import { ReviewTaskLabel } from './ReviewTaskLabel'

type CompletedTaskListProps = {
  items: TaskItem[]
  onSelect?: (item: TaskItem) => void
  showDate?: boolean
  formatDateLabel?: (date: string) => string
  getHoverDetails?: (item: TaskItem) => string[]
  className?: string
}

export function CompletedTaskList({
  items,
  onSelect,
  showDate = false,
  formatDateLabel = (date) => date,
  getHoverDetails,
  className = '',
}: CompletedTaskListProps) {
  return (
    <div className={`rounded-2xl bg-surface-card p-card shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold text-accent">완료</h3>
      <div className="mt-card-item space-y-element">
        {items.length === 0 ? (
          <p className="text-sm text-text-tertiary">아직 완료한 일이 없어요.</p>
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
                    titleClassName="truncate text-sm font-medium text-text-tertiary line-through"
                  />
                  {showDate && (
                    <p className="mt-0.5 text-[11px] text-text-tertiary">{formatDateLabel(item.date)}</p>
                  )}
                </div>
                {item.focusSeconds >= 60 && (
                  <span className="ml-2 shrink-0 text-[11px] font-semibold text-accent">
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
