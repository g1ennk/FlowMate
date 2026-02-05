import { ChevronLeftIcon, ChevronRightIcon } from '../../../ui/Icons'

type PeriodNavigatorProps = {
  label: string
  badge?: string
  onPrev: () => void
  onNext: () => void
}

export function PeriodNavigator({
  label,
  badge,
  onPrev,
  onNext,
}: PeriodNavigatorProps) {
  return (
    <div className="grid grid-cols-[36px_1fr_36px] items-center rounded-2xl bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <div className="flex items-center justify-center gap-2">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        {badge && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
            {badge}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  )
}
