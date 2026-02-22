import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../../../ui/Icons'

type TimelineGroupProps = {
  label: string
  taskCount: number
  completedCount: number
  incompleteCount: number
  isExpanded: boolean
  onToggle: () => void
  children: ReactNode
}

export function TimelineGroup({
  label,
  taskCount,
  completedCount,
  incompleteCount,
  isExpanded,
  onToggle,
  children,
}: TimelineGroupProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronRightIcon
          className={`h-4 w-4 text-gray-400 transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <div className="ml-auto flex items-center gap-2 text-[11px] font-semibold text-gray-400">
          <span>{taskCount}개</span>
          <span className="hidden text-gray-300 sm:inline">|</span>
          <span className="text-emerald-600">완료 {completedCount}</span>
          <span>미완료 {incompleteCount}</span>
        </div>
      </button>
      {isExpanded && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  )
}
