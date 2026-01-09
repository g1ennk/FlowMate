import {
  CheckIcon,
  MoreVerticalIcon,
  PlayIcon,
} from '../../ui/Icons'

export type TodoItemProps = {
  title: string
  note?: string | null
  pomodoroDone: number
  focusSeconds: number
  isDone: boolean
  isEditing: boolean
  editingTitle: string
  onEditingTitleChange: (value: string) => void
  onToggle: () => void
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onOpenMenu?: () => void
  onOpenTimer?: () => void
}

export function TodoItem({
  title,
  note,
  pomodoroDone,
  focusSeconds,
  isDone,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onToggle,
  onSaveEdit,
  onCancelEdit,
  onOpenMenu,
  onOpenTimer,
}: TodoItemProps) {
  const focusMin = Math.round(focusSeconds / 60)

  // 편집 모드
  if (isEditing) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-2 ring-2 ring-emerald-500">
        <input
          type="text"
          value={editingTitle}
          onChange={(e) => onEditingTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit()
            if (e.key === 'Escape') onCancelEdit()
          }}
          autoFocus
          className="flex-1 bg-transparent px-2 py-1 text-sm text-gray-900 outline-none"
        />
        <button
          onClick={onCancelEdit}
          className="rounded-lg px-3 py-1 text-xs text-gray-500 hover:bg-gray-200"
        >
          취소
        </button>
        <button
          onClick={onSaveEdit}
          className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600"
        >
          저장
        </button>
      </div>
    )
  }

  // 기본 상태
  return (
    <div className="rounded-xl p-2 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-3">
        {/* 체크박스 */}
        <button
          onClick={onToggle}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            isDone
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-gray-300 bg-transparent hover:border-emerald-500'
          }`}
        >
          {isDone && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
        </button>

        {/* 내용 */}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={onOpenMenu}
        >
          <p
            className={`truncate text-sm ${
              isDone ? 'text-gray-400 line-through' : 'text-gray-900'
            }`}
          >
            {title}
          </p>
          {/* 누적 통계 표시 */}
          {(pomodoroDone > 0 || focusMin > 0) && (
            <div className="mt-0.5 flex items-center gap-1.5">
              {pomodoroDone > 0 && (
                <span className={`text-xs ${isDone ? 'text-emerald-600' : 'text-blue-500'}`}>{pomodoroDone}회</span>
              )}
              {focusMin > 0 && (
                <span className="text-xs text-gray-400">{focusMin}분</span>
              )}
            </div>
          )}
        </div>

        {/* 시작 버튼 */}
        {!isDone && (
          <button
            onClick={onOpenTimer}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald-500 transition-colors hover:bg-emerald-50"
          >
            <PlayIcon className="h-3.5 w-3.5 translate-x-0.5" />
          </button>
        )}

        {/* 더보기 버튼 */}
        <button
          onClick={onOpenMenu}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      {/* 메모 표시 */}
      {note && (
        <div className="ml-8 mt-1">
          <p className="text-xs text-gray-400 line-clamp-2">{note}</p>
        </div>
      )}
    </div>
  )
}
