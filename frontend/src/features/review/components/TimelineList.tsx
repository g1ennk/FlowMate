import { useState } from 'react'
import type { TimelineGroupData, TaskItem } from '../reviewTypes'
import { formatMonthDayLabel } from '../reviewUtils'
import { TimelineGroup } from './TimelineGroup'
import { TimelineTaskItem } from './TimelineTaskItem'

type TimelineListProps = {
  groups: TimelineGroupData[]
  viewMode: 'weekly' | 'monthly'
  miniDayLabels: Array<{ id: number; label: string }>
  onSelectTask?: (task: TaskItem) => void
}

const groupItemsByDate = (
  completed: TaskItem[],
  incomplete: TaskItem[],
) => {
  const map = new Map<string, { completed: TaskItem[]; incomplete: TaskItem[] }>()

  completed.forEach((item) => {
    if (!map.has(item.date)) {
      map.set(item.date, { completed: [], incomplete: [] })
    }
    map.get(item.date)?.completed.push(item)
  })

  incomplete.forEach((item) => {
    if (!map.has(item.date)) {
      map.set(item.date, { completed: [], incomplete: [] })
    }
    map.get(item.date)?.incomplete.push(item)
  })

  return Array.from(map.entries())
    .sort(([a], [b]) => (a > b ? 1 : a < b ? -1 : 0))
    .map(([dateKey, items]) => ({ dateKey, ...items }))
}

const buildMiniDaySections = (
  completed: TaskItem[],
  incomplete: TaskItem[],
  miniDayLabels: Array<{ id: number; label: string }>,
) => {
  return miniDayLabels
    .map((group) => {
      const doneItems = completed.filter((item) => (item.miniDay ?? 0) === group.id)
      const incompleteItems = incomplete.filter((item) => (item.miniDay ?? 0) === group.id)
      return {
        id: group.id,
        label: group.label,
        completed: doneItems,
        incomplete: incompleteItems,
        hasItems: doneItems.length + incompleteItems.length > 0,
      }
    })
    .filter((group) => group.hasItems)
}

export function TimelineList({
  groups,
  viewMode,
  miniDayLabels,
  onSelectTask,
}: TimelineListProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(groups.map((group) => group.key)),
  )

  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="space-y-3">
      {groups.map((group, index) => {
        const isExpanded = expandedKeys.has(group.key)
        const hasCompleted = group.completedTasks.length > 0
        const hasIncomplete = group.incompleteTasks.length > 0
        const showMonthly = viewMode === 'monthly'
        const dateGroups =
          viewMode === 'monthly'
            ? groupItemsByDate(group.completedTasks, group.incompleteTasks)
            : []

        return (
          <TimelineGroup
            key={`${viewMode}-${group.key}-${index}`}
            label={group.label}
            taskCount={group.taskCount}
            isExpanded={isExpanded}
            onToggle={() => toggleGroup(group.key)}
          >
            {!hasCompleted && !hasIncomplete && (
              <p className="text-sm text-gray-400">태스크가 없어요.</p>
            )}

            {showMonthly && (hasCompleted || hasIncomplete) && (
              <div className="space-y-1.5">
                {dateGroups.map((dateGroup) => (
                  <div key={dateGroup.dateKey} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400">
                      <span>{formatMonthDayLabel(dateGroup.dateKey)}</span>
                      <div className="h-px flex-1 bg-gray-100" />
                    </div>
                    {buildMiniDaySections(
                      dateGroup.completed,
                      dateGroup.incomplete,
                      miniDayLabels,
                    ).map((miniDayGroup) => (
                      <div key={miniDayGroup.id} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400">
                          <span>{miniDayGroup.label}</span>
                          <div className="h-px flex-1 bg-gray-100" />
                        </div>
                        {miniDayGroup.completed.map((item) => (
                          <TimelineTaskItem
                            key={item.id}
                            item={item}
                            onSelect={onSelectTask}
                          />
                        ))}
                        {miniDayGroup.incomplete.map((item) => (
                          <TimelineTaskItem
                            key={item.id}
                            item={item}
                            onSelect={onSelectTask}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {!showMonthly && (hasCompleted || hasIncomplete) && (
              <div className="space-y-1.5">
                {buildMiniDaySections(
                  group.completedTasks,
                  group.incompleteTasks,
                  miniDayLabels,
                ).map((miniDayGroup) => (
                  <div key={miniDayGroup.id} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400">
                      <span>{miniDayGroup.label}</span>
                      <div className="h-px flex-1 bg-gray-100" />
                    </div>
                    {miniDayGroup.completed.map((item) => (
                      <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
                    ))}
                    {miniDayGroup.incomplete.map((item) => (
                      <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </TimelineGroup>
        )
      })}
    </div>
  )
}
