import type { TaskItem } from '../reviewTypes'

type CompletedTaskListProps = {
  items: TaskItem[]
  onSelect?: (item: TaskItem) => void
}

export function CompletedTaskList({ items, onSelect }: CompletedTaskListProps) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">완료한 일</h3>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">아직 완료한 일이 없어요.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item)}
              className="flex w-full items-center justify-between rounded-xl border border-gray-100 px-3 py-2 text-left transition hover:bg-gray-50"
            >
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              <span className="text-[9px] font-semibold text-emerald-600">
                {item.focusTime}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
