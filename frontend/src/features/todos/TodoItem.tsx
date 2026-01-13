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
  onEditingTitleChange: (value: string) => void
  onToggle: () => void
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onOpenMenu?: () => void
  onOpenTimer?: () => void
  onOpenNote?: () => void
  // 실시간 타이머 정보
  isActiveTimer?: boolean
  activeTimerMode?: 'stopwatch' | 'pomodoro' // 타이머 모드
  activeTimerElapsedMs?: number
  activeTimerRemainingMs?: number // 뽀모도로용 (카운트다운)
  activeTimerPhase?: 'flow' | 'short' | 'long' // 뽀모도로 phase
  breakElapsedMs?: number // Flexible 타이머 휴식 시간
  isBreakPhase?: boolean // 휴식 중인지 여부
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
  onOpenNote,
  isActiveTimer,
  activeTimerMode,
  activeTimerElapsedMs,
  activeTimerRemainingMs,
  activeTimerPhase,
  breakElapsedMs,
  isBreakPhase,
}: TodoItemProps) {
  // 실시간 타이머가 실행 중일 때
  let displayTimeSeconds: number
  let isShowingBreak = false
  
  // 완료된 태스크는 항상 저장된 focusSeconds 표시
  if (isDone) {
    displayTimeSeconds = focusSeconds
  } else if (isActiveTimer && isBreakPhase && breakElapsedMs !== undefined) {
    // 휴식 중: 휴식 시간 표시
    displayTimeSeconds = Math.floor(breakElapsedMs / 1000)
    isShowingBreak = true
  } else if (isActiveTimer) {
    if (activeTimerRemainingMs !== undefined) {
      // 뽀모도로: 카운트다운 (남은 시간 표시)
      displayTimeSeconds = Math.ceil(activeTimerRemainingMs / 1000)
    } else if (activeTimerElapsedMs !== undefined) {
      // 일반 타이머 집중 중: 카운트업 (elapsedMs는 이미 focusSeconds를 포함)
      displayTimeSeconds = Math.floor(activeTimerElapsedMs / 1000)
    } else {
      displayTimeSeconds = focusSeconds
    }
  } else {
    displayTimeSeconds = focusSeconds
  }
  
  const totalFocusSeconds = displayTimeSeconds
  
  // 시간 포맷 (완료/미완료에 따라 다르게)
  const focusMin = Math.floor(totalFocusSeconds / 60)
  const focusSec = totalFocusSeconds % 60
  const focusTimeDisplay = isDone 
    ? `${focusMin}분`  // 완료: "3분"
    : `${focusMin}:${String(focusSec).padStart(2, '0')}`  // 미완료/휴식: "3:45"

  // 편집 모드
  if (isEditing) {
    return (
      <div className="rounded-xl p-2">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
          {/* 체크박스 (비활성) */}
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent opacity-50" />
          
          {/* 입력 필드 */}
          <input
            type="text"
            value={editingTitle}
            onChange={(e) => onEditingTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            onBlur={onSaveEdit}
            autoFocus
            className="flex-1 bg-transparent text-sm text-gray-900 outline-none"
          />
          
          {/* 더보기 버튼 (비활성) */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-50">
            <MoreVerticalIcon className="h-4 w-4" />
          </div>
        </div>
      </div>
    )
  }

  // 기본 상태
  return (
    <div className="rounded-xl p-2">
      <div 
        className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-gray-50"
      >
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
              className={`mt-0.5 flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 transition-colors ${
                isDone ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'
              }`}
            >
              {/* 아이콘: 휴식=Stop, 집중=Clock | 색깔: 뽀모=빨강, 일반=초록 */}
              {isActiveTimer && (isBreakPhase || activeTimerPhase === 'short' || activeTimerPhase === 'long') ? (
                <StopIcon 
                  className={`h-3.5 w-3.5 shrink-0 ${
                    activeTimerMode === 'pomodoro' ? 'text-red-500' : 'text-emerald-400'
                  }`}
                />
              ) : (
                <ClockIcon 
                  className={`h-3.5 w-3.5 shrink-0 ${
                    // 완료: 진한 초록색
                    isDone 
                      ? 'text-emerald-600'
                    // 진행 중: 모드에 따라 색 구분
                    : isActiveTimer && activeTimerMode === 'pomodoro'
                      ? 'text-red-500'        // 뽀모도로: 빨간색
                      : 'text-emerald-400'    // 일반: 초록색
                  }`} 
                />
              )}
              {totalFocusSeconds > 0 && (
                <span className={`text-xs font-medium tabular-nums ${
                  // 완료: 진한 초록색
                  isDone 
                    ? 'text-emerald-600'
                  // 진행 중/휴식 중: 모드에 따라 색 구분
                  : isActiveTimer && activeTimerMode === 'pomodoro'
                    ? 'text-red-500'        // 뽀모도로: 빨간색
                    : 'text-emerald-400'    // 일반: 초록색
                }`}>
                  {focusTimeDisplay}
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
        <div className="ml-6 mt-2">
          <div 
            className="cursor-pointer rounded-lg bg-yellow-50 border border-yellow-200 px-2 py-1"
            onClick={onOpenNote}
          >
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{note}</p>
          </div>
        </div>
      )}
    </div>
  )
}
