import type { TaskItem } from '../reviewTypes'
import { TimelineTaskItem } from './TimelineTaskItem'

type DailyTaskListProps = {
  tasks: TaskItem[]
  miniDayLabels: Array<{ id: number; label: string }>
  onSelectTask?: (task: TaskItem) => void
}

export function DailyTaskList({
  tasks,
  miniDayLabels,
  onSelectTask,
}: DailyTaskListProps) {
  const hasTasks = tasks.length > 0
  const miniDayGroups = miniDayLabels
    .map((group) => ({
      ...group,
      items: tasks.filter((item) => (item.miniDay ?? 0) === group.id),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <section className="rounded-2xl bg-surface-card p-4 shadow-sm">
      <div className="space-y-2 md:max-h-72 md:overflow-y-auto md:pr-1">
        {!hasTasks && (
          <p className="text-sm text-text-tertiary">표시할 태스크가 없어요.</p>
        )}

        {miniDayGroups.map((group) => {
          const completed = group.items.filter((item) => item.isDone)
          const incomplete = group.items.filter((item) => !item.isDone)
          return (
            <div key={group.id} className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-text-tertiary">
                <span>{group.label}</span>
                <div className="h-px flex-1 bg-surface-sunken" />
              </div>
              {completed.map((item) => (
                <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
              ))}
              {incomplete.map((item) => (
                <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
