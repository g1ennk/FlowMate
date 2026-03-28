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
  isToday?: boolean
}

export function TimelineGroup({
  label,
  taskCount,
  completedCount,
  incompleteCount,
  isExpanded,
  onToggle,
  children,
  isToday = false,
}: TimelineGroupProps) {
  return (
    <div className={`rounded-2xl bg-surface-card p-card shadow-sm ${isToday ? 'ring-2 ring-accent/30' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronRightIcon
          className={`h-4 w-4 text-text-tertiary transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        <div className="ml-auto flex items-center gap-2 text-[11px] font-semibold text-text-tertiary">
          <span>{taskCount}개</span>
          <span className="hidden text-text-disabled sm:inline">|</span>
          <span className="text-accent">완료 {completedCount}</span>
          <span>미완료 {incompleteCount}</span>
        </div>
      </button>
      {isExpanded && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  )
}
