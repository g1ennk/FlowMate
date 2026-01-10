import {
  CheckIcon,
  ClockIcon,
  StopIcon,
  MoreVerticalIcon,
} from '../../ui/Icons'

export type TodoItemProps = {
  title: string
  note?: string | null
  pomodoroDone: number
  focusSeconds: number
  isDone: boolean
  isEditing: boolean
  editingTitle: string
  timerMode?: 'stopwatch' | 'pomodoro' | null
  onEditingTitleChange: (value: string) => void
  onToggle: () => void
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onOpenMenu?: () => void
  onOpenTimer?: () => void
  // 실시간 타이머 정보
  isActiveTimer?: boolean
  activeTimerElapsedMs?: number
  activeTimerRemainingMs?: number // 뽀모도로용 (카운트다운)
  activeTimerPhase?: 'flow' | 'short' | 'long' // 뽀모도로 phase
}

export function TodoItem({
  title,
  note,
  pomodoroDone,
  focusSeconds,
  isDone,
  isEditing,
  editingTitle,
  timerMode,
  onEditingTitleChange,
  onToggle,
  onSaveEdit,
  onCancelEdit,
  onOpenMenu,
  onOpenTimer,
  isActiveTimer,
  activeTimerElapsedMs,
  activeTimerRemainingMs,
  activeTimerPhase,
}: TodoItemProps) {
  // 실시간 타이머가 실행 중일 때
  let displayTimeSeconds: number
  let isCountdown = false
  
  if (isActiveTimer) {
    if (activeTimerRemainingMs !== undefined) {
      // 뽀모도로: 카운트다운 (남은 시간 표시)
      displayTimeSeconds = Math.ceil(activeTimerRemainingMs / 1000)
      isCountdown = true
    } else if (activeTimerElapsedMs !== undefined) {
      // 일반 타이머: 카운트업 (elapsedMs는 이미 focusSeconds를 포함)
      displayTimeSeconds = Math.floor(activeTimerElapsedMs / 1000)
      isCountdown = false
    } else {
      displayTimeSeconds = focusSeconds
    }
  } else {
    displayTimeSeconds = focusSeconds
  }
  
  const totalFocusSeconds = displayTimeSeconds
  
  // 분:초 형태로 포맷
  const focusMin = Math.floor(totalFocusSeconds / 60)
  const focusSec = totalFocusSeconds % 60
  const focusTimeDisplay = `${focusMin}:${String(focusSec).padStart(2, '0')}`

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
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm cursor-pointer ${
              isDone ? 'text-gray-400 line-through' : 'text-gray-900'
            }`}
            onClick={onOpenMenu}
          >
            {title}
          </p>
          {/* 누적 통계 표시 - 타이머 버튼 */}
          {(pomodoroDone > 0 || totalFocusSeconds > 0) && (
            <button
              onClick={onOpenTimer}
              className="mt-0.5 flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 transition-colors hover:bg-gray-50"
            >
              {/* 휴식 상태일 때 Stop 아이콘, 그 외에는 Clock 아이콘 */}
              {isActiveTimer && (activeTimerPhase === 'short' || activeTimerPhase === 'long') ? (
                <StopIcon 
                  className="h-3.5 w-3.5 shrink-0 text-red-500" 
                />
              ) : (
                <ClockIcon 
                  className={`h-3.5 w-3.5 shrink-0 ${
                    // 뽀모도로 타이머가 활성화되어 있고 카운트다운 중이면 빨간색
                    isActiveTimer && isCountdown
                      ? 'text-red-500'
                      : timerMode === 'pomodoro'
                        ? isDone 
                          ? 'text-red-400' 
                          : 'text-red-500' // 뽀모도로: 빨간색
                        : isDone 
                          ? 'text-emerald-400' 
                          : 'text-emerald-500' // 일반 또는 미선택: 초록색
                  }`} 
                />
              )}
              {totalFocusSeconds > 0 && (
                <span className={`text-xs font-medium tabular-nums ${
                  // 뽀모도로 타이머가 활성화되어 있고 카운트다운 중이면 빨간색
                  isActiveTimer && isCountdown
                    ? 'text-red-500'
                    : isDone 
                      ? 'text-emerald-400' 
                      : 'text-emerald-600'
                }`}>
                  {focusTimeDisplay}
                </span>
              )}
              {pomodoroDone > 0 && totalFocusSeconds > 0 && (
                <span className="text-xs text-gray-300">·</span>
              )}
              {pomodoroDone > 0 && (
                <span className={`text-xs font-medium ${isDone ? 'text-blue-400' : 'text-blue-500'}`}>
                  {pomodoroDone}회
                </span>
              )}
            </button>
          )}
        </div>

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
        <div className="ml-8 mt-2">
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{note}</p>
        </div>
      )}
    </div>
  )
}
