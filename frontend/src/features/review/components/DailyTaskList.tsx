import { Link } from 'react-router-dom'
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
    <section className="rounded-2xl bg-surface-card p-card shadow-sm">
      <h3 className="mb-card-item text-sm font-semibold text-text-primary">오늘의 할 일</h3>
      <div className="space-y-list md:max-h-72 md:overflow-y-auto md:pr-1">
        {!hasTasks && (
          <div className="space-y-list py-list text-center">
            <p className="text-sm text-text-tertiary">오늘 할 일을 추가하고 완료하면 여기에 나타나요.</p>
            <Link
              to="/todos"
              className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-accent-hover"
            >
              계획 페이지로 이동
            </Link>
          </div>
        )}

        {miniDayGroups.map((group) => {
          const completed = group.items.filter((item) => item.isDone)
          const incomplete = group.items.filter((item) => !item.isDone)
          return (
            <div key={group.id} className="space-y-element">
              <div className="flex items-center gap-list text-[11px] font-semibold text-text-tertiary">
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
