import { PHASE_LABELS } from '../../lib/constants'
import { formatMs } from '../../lib/time'
import {
  CheckIcon,
  MoreVerticalIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../ui/Icons'

export type TodoItemProps = {
  title: string
  note?: string | null
  pomodoroDone: number
  focusSeconds: number
  isDone: boolean
  isActive: boolean
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
  // 타이머 props
  timerState?: {
    phase: string
    status: string
    remainingMs: number
    cycleCount: number
    cycleEvery: number
    isPending: boolean
  }
  onPause?: () => void
  onResume?: () => void
  onStop?: () => void
  onSkipToBreak?: () => void
  onSkipToFlow?: () => void
  onCompleteTask?: () => void
}

export function TodoItem({
  title,
  note,
  pomodoroDone,
  focusSeconds,
  isDone,
  isActive,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onToggle,
  onSaveEdit,
  onCancelEdit,
  onOpenMenu,
  onOpenTimer,
  timerState,
  onPause,
  onResume,
  onStop,
  onSkipToBreak,
  onSkipToFlow,
  onCompleteTask,
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

  // 타이머 활성 상태 (확장된 뷰)
  if (isActive && timerState) {
    const { phase, status, remainingMs, cycleCount, cycleEvery, isPending } = timerState
    const isFlow = phase === 'flow'
    const isRunning = status === 'running'
    const isWaiting = status === 'waiting'
    const currentCycle = cycleCount % cycleEvery

    return (
      <div className="rounded-2xl bg-emerald-50 p-4">
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggle}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-emerald-500 bg-transparent hover:bg-emerald-100"
            />
            <span className="text-sm font-medium text-gray-900">{title}</span>
          </div>
          <button
            onClick={onOpenMenu}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-emerald-100"
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Phase 라벨 */}
        <p className="mb-2 text-center text-sm font-medium text-emerald-600">
          {PHASE_LABELS[phase] ?? 'Flow'}
        </p>

        {/* 타이머 숫자 */}
        <p className="mb-3 text-center text-5xl font-light tabular-nums tracking-tight text-gray-900">
          {formatMs(remainingMs)}
        </p>

        {/* 사이클 표시 */}
        <div className="mb-4 flex items-center justify-center gap-1.5">
          {Array.from({ length: cycleEvery }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i < currentCycle ? 'bg-emerald-500' : 'bg-emerald-200'
              }`}
            />
          ))}
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex items-center justify-center gap-2">
          {/* 휴식으로 건너뛰기 */}
          <button
            onClick={onSkipToBreak}
            disabled={!isFlow}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              isFlow
                ? 'text-emerald-600 hover:bg-emerald-100'
                : 'cursor-not-allowed text-emerald-200'
            }`}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>

          <button
            onClick={onStop}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50"
          >
            <StopIcon className="h-4 w-4" />
          </button>

          <button
            onClick={isRunning ? onPause : onResume}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-colors hover:bg-emerald-600"
          >
            {isRunning ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="h-5 w-5 translate-x-0.5" />
            )}
          </button>

          {/* 태스크 완료 버튼 */}
          <button
            onClick={onCompleteTask}
            disabled={isPending}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-500 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="태스크 완료"
          >
            <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
          </button>

          {/* Flow로 건너뛰기 */}
          <button
            onClick={onSkipToFlow}
            disabled={isFlow}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              !isFlow
                ? 'text-emerald-600 hover:bg-emerald-100'
                : 'cursor-not-allowed text-emerald-200'
            }`}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>

        {/* waiting 상태 안내 */}
        {isWaiting && (
          <p className="mt-3 text-center text-xs text-emerald-600">
            재생 버튼을 눌러 {isFlow ? 'Flow를' : '휴식을'} 시작하세요
          </p>
        )}

        {/* 통계 */}
        {(pomodoroDone > 0 || focusMin > 0) && (
          <div className="mt-3 flex items-center justify-center gap-2 border-t border-emerald-100 pt-3">
            {pomodoroDone > 0 && (
              <span className="text-xs text-emerald-600">{pomodoroDone}회 완료</span>
            )}
            {focusMin > 0 && (
              <span className="text-xs text-gray-400">총 {focusMin}분</span>
            )}
          </div>
        )}

        {/* 메모 */}
        {note && (
          <div className="mt-3 border-t border-emerald-100 pt-3">
            <p className="text-xs text-gray-500 whitespace-pre-wrap">{note}</p>
          </div>
        )}
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
