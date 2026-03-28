import { useEffect, useState } from 'react'
import type { TimelineGroupData, TaskItem } from '../reviewTypes'
import { formatMonthDayLabel } from '../reviewUtils'
import { TimelineGroup } from './TimelineGroup'
import { TimelineTaskItem } from './TimelineTaskItem'

type TimelineListProps = {
  groups: TimelineGroupData[]
  viewMode: 'weekly' | 'monthly'
  miniDayLabels: Array<{ id: number; label: string }>
  onSelectTask?: (task: TaskItem) => void
  todayKey?: string
  title?: string
  highlightKey?: string
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
  todayKey,
  title,
  highlightKey,
}: TimelineListProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.taskCount > 0).map((g) => g.key)),
  )

  useEffect(() => {
    setExpandedKeys((prev) => {
      const validKeys = new Set(groups.map((g) => g.key))
      const next = new Set([...prev].filter((k) => validKeys.has(k)))
      groups.forEach((g) => {
        if (g.taskCount > 0 && !next.has(g.key)) next.add(g.key)
      })
      return next.size === prev.size && [...next].every((k) => prev.has(k)) ? prev : next
    })
  }, [groups])

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
    <div className="space-y-card-item">
      {title && (
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      )}
      {groups.map((group, index) => {
        const isExpanded = expandedKeys.has(group.key)
        const hasCompleted = group.completedTasks.length > 0
        const hasIncomplete = group.incompleteTasks.length > 0
        const showMonthly = viewMode === 'monthly'
        const dateGroups =
          viewMode === 'monthly'
            ? groupItemsByDate(group.completedTasks, group.incompleteTasks)
            : []

        const matchKey = highlightKey ?? todayKey
        const isGroupToday = matchKey
          ? group.key === `daily-${matchKey}` || group.key.startsWith(`weekly-${matchKey}-`)
          : false

        return (
          <TimelineGroup
            key={`${viewMode}-${group.key}-${index}`}
            label={group.label}
            taskCount={group.taskCount}
            completedCount={group.completedTasks.length}
            incompleteCount={group.incompleteTasks.length}
            isExpanded={isExpanded}
            onToggle={() => toggleGroup(group.key)}
            isToday={isGroupToday}
          >
            {!hasCompleted && !hasIncomplete && (
              <p className="text-sm text-text-tertiary">이 기간에 작업한 내역이 없어요. 할 일을 완료하면 타임라인이 만들어져요.</p>
            )}

            {showMonthly && (hasCompleted || hasIncomplete) && (
              <div className="space-y-element">
                {dateGroups.map((dateGroup) => (
                  <div key={dateGroup.dateKey} className="space-y-element">
                    <div className="flex items-center gap-list text-[11px] font-semibold text-text-tertiary">
                      <span>{formatMonthDayLabel(dateGroup.dateKey)}</span>
                      <div className="h-px flex-1 bg-surface-sunken" />
                    </div>
                    {buildMiniDaySections(
                      dateGroup.completed,
                      dateGroup.incomplete,
                      miniDayLabels,
                    ).map((miniDayGroup) => (
                      <div key={miniDayGroup.id} className="space-y-element">
                        <div className="flex items-center gap-list text-[11px] font-semibold text-text-tertiary">
                          <span>{miniDayGroup.label}</span>
                          <div className="h-px flex-1 bg-surface-sunken" />
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
              <div className="space-y-element">
                {buildMiniDaySections(
                  group.completedTasks,
                  group.incompleteTasks,
                  miniDayLabels,
                ).map((miniDayGroup) => (
                  <div key={miniDayGroup.id} className="space-y-element">
                    <div className="flex items-center gap-list text-[11px] font-semibold text-text-tertiary">
                      <span>{miniDayGroup.label}</span>
                      <div className="h-px flex-1 bg-surface-sunken" />
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
