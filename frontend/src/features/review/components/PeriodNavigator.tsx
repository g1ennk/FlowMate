import { ChevronLeftIcon, ChevronRightIcon } from '../../../ui/Icons'

type PeriodNavigatorProps = {
  label: string
  onPrev: () => void
  onNext: () => void
}

export function PeriodNavigator({ label, onPrev, onNext }: PeriodNavigatorProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={onPrev}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <div className="text-sm font-semibold text-gray-900">{label}</div>
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
