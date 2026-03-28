import { ChevronLeftIcon, ChevronRightIcon } from '../../../ui/Icons'

type PeriodNavigatorProps = {
  label: string
  badge?: string
  isCurrent?: boolean
  jumpLabel?: string
  onJumpToCurrent?: () => void
  onPrev: () => void
  onNext: () => void
}

export function PeriodNavigator({
  label,
  badge,
  isCurrent = false,
  jumpLabel = '현재로 이동',
  onJumpToCurrent,
  onPrev,
  onNext,
}: PeriodNavigatorProps) {
  return (
    <div className="grid grid-cols-[36px_1fr_36px] items-center rounded-2xl bg-surface-card px-card py-card-item shadow-sm">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary hover:bg-hover-strong"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-col items-center justify-center gap-1">
        <div className="flex min-w-0 items-center justify-center gap-2">
          <div className="truncate text-sm font-medium text-text-primary">{label}</div>
          {badge && (
            <span className="shrink-0 rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold text-accent">
              {badge}
            </span>
          )}
        </div>
        {onJumpToCurrent && !isCurrent && (
          <button
            type="button"
            onClick={onJumpToCurrent}
            className="text-[11px] font-medium text-accent hover:text-accent-text"
          >
            {jumpLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary hover:bg-hover-strong"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  )
}
