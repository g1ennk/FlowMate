import type { TaskItem } from '../reviewTypes'

type IncompleteTasksProps = {
  items: TaskItem[]
  onSelect?: (item: TaskItem) => void
}

export function IncompleteTasks({ items, onSelect }: IncompleteTasksProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">미완료</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">모두 마무리했어요.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item)}
              className="flex w-full items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-left transition hover:bg-gray-50"
            >
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              {item.focusSeconds > 0 && (
                <span className="text-[9px] font-semibold text-gray-500">
                  {item.focusTime}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
