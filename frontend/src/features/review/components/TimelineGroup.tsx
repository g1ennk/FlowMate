import type { ReactNode } from 'react'
import { ChevronRightIcon } from '../../../ui/Icons'

type TimelineGroupProps = {
  label: string
  taskCount: number
  isExpanded: boolean
  onToggle: () => void
  children: ReactNode
}

export function TimelineGroup({
  label,
  taskCount,
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
        <span className="text-xs font-semibold text-gray-400">
          {taskCount}개
        </span>
      </button>
      {isExpanded && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  )
}
