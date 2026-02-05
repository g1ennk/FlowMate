import type { TaskItem } from '../reviewTypes'
import { TimelineTaskItem } from './TimelineTaskItem'

type DailyTaskListProps = {
  completedTasks: TaskItem[]
  incompleteTasks: TaskItem[]
  onSelectTask?: (task: TaskItem) => void
}

export function DailyTaskList({
  completedTasks,
  incompleteTasks,
  onSelectTask,
}: DailyTaskListProps) {
  const hasCompleted = completedTasks.length > 0
  const hasIncomplete = incompleteTasks.length > 0

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {!hasCompleted && !hasIncomplete && (
          <p className="text-sm text-gray-400">표시할 태스크가 없어요.</p>
        )}

        {hasCompleted && (
          <div className="space-y-1.5">
            {completedTasks.map((item) => (
              <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
            ))}
          </div>
        )}

        {hasIncomplete && (
          <div className="space-y-1.5">
            {incompleteTasks.map((item) => (
              <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
