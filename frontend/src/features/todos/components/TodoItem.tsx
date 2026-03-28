import { useEffect, useRef } from 'react'
import {
  CheckIcon,
  ClockIcon,
  StopIcon,
  MoreVerticalIcon,
} from '../../../ui/Icons'
import { userTextDisplayClass, userTextInputClass } from '../../../lib/userTextStyles'
import { formatTimerSeconds, getTodoDisplayTimeSeconds } from '../todoTimerDisplay'
import { useTimerStore } from '../../timer/timerStore'
import { getTimerInfo } from '../../timer/useTimerInfo'

export type TodoItemProps = {
  todoId: string
  title: string
  reviewBadgeLabel?: string | null
  note?: string | null
  sessionCount: number
  sessionFocusSeconds: number
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
}

export function TodoItem({
  todoId,
  title,
  reviewBadgeLabel,
  note,
  sessionCount,
  sessionFocusSeconds,
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
}: TodoItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 이 todo의 타이머만 구독 → 타이머가 tick해도 이 컴포넌트만 리렌더링
  const timer = useTimerStore((s) => s.timers[todoId])
  const {
    isActiveTimer,
    activeTimerElapsedMs,
    activeTimerRemainingMs,
    activeTimerPhase,
    breakElapsedMs,
    breakTargetMs,
    isBreakPhase,
    flexiblePhase,
  } = getTimerInfo(timer)
  const activeTimerMode = timer?.mode

  // 편집 모드: 자동 높이/포커스 처리
  useEffect(() => {
    if (!isEditing) return
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [isEditing, editingTitle])

  useEffect(() => {
    if (!isEditing) return
    const textarea = textareaRef.current
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [isEditing])

  const totalFocusSeconds = getTodoDisplayTimeSeconds({
    isDone,
    sessionFocusSeconds,
    isActiveTimer,
    activeTimerElapsedMs,
    activeTimerRemainingMs,
    breakElapsedMs,
    breakTargetMs,
    flexiblePhase,
  })

  const focusTimeDisplay = formatTimerSeconds(totalFocusSeconds)
  const shouldShowTimerButton = !!isActiveTimer || sessionCount > 0 || totalFocusSeconds > 0
  const shouldShowTimerTime = totalFocusSeconds > 0 || !!isActiveTimer

  // 편집 모드
  if (isEditing) {
    return (
      <div className="rounded-xl p-2">
        <div className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
          {/* 체크박스 (비활성) */}
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-transparent opacity-50 mt-0.5" />

          {/* 입력 필드 */}
          <textarea
            ref={textareaRef}
            value={editingTitle}
            onChange={(e) => {
              onEditingTitleChange(e.target.value)
              // 높이 자동 조정
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSaveEdit()
              }
              if (e.key === 'Escape') onCancelEdit()
            }}
            onBlur={onSaveEdit}
            className={`flex-1 bg-transparent ${userTextInputClass} text-text-primary outline-none resize-none overflow-hidden min-h-[20px]`}
            rows={1}
          />

          {/* 더보기 버튼 (비활성) */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-disabled opacity-50">
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
        className="flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-hover"
      >
        {/* 체크박스 */}
        <button
          onClick={onToggle}
          aria-label={`${title}${reviewBadgeLabel ? ` ${reviewBadgeLabel}` : ''} ${isDone ? '완료 취소' : '완료'}`}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            isDone
              ? 'border-accent bg-accent text-text-inverse'
              : 'border-border-strong bg-transparent hover:border-accent'
          }`}
        >
          {isDone && <CheckIcon className="h-3 w-3 animate-check-pop" strokeWidth={3} />}
        </button>

        {/* 내용 */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="inline-flex max-w-full flex-wrap items-center gap-2 text-left"
          >
            <span
              className={`${userTextDisplayClass} ${
                isDone ? 'text-text-tertiary line-through' : 'text-text-primary'
              }`}
            >
              {title}
            </span>
            {reviewBadgeLabel && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-accent bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold leading-none text-accent-text">
                {reviewBadgeLabel}
              </span>
            )}
          </button>
          {/* 누적 통계 표시 - 타이머 버튼 */}
          {shouldShowTimerButton && (
            <button
              onClick={onOpenTimer}
              className={`mt-0.5 flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 transition-colors ${
                isDone ? 'cursor-default' : 'hover:bg-hover cursor-pointer'
              }`}
            >
              {/* 아이콘: 휴식=Stop, 집중=Clock | 색깔: 뽀모=빨강, 일반=초록 */}
              {!isDone && isActiveTimer && (isBreakPhase || activeTimerPhase === 'short' || activeTimerPhase === 'long') ? (
                <StopIcon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    activeTimerMode === 'pomodoro' ? 'text-state-error' : 'text-accent'
                  }`}
                />
              ) : (
                <ClockIcon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    // 완료: 진한 초록색
                    isDone
                      ? 'text-accent'
                    // 진행 중: 모드에 따라 색 구분
                    : isActiveTimer && activeTimerMode === 'pomodoro'
                      ? 'text-state-error'        // 뽀모도로: 빨간색
                      : 'text-accent'    // 일반: 초록색
                  }`}
                />
              )}
              {shouldShowTimerTime && (
                <span className={`text-xs font-medium tabular-nums ${
                    // 완료: 진한 초록색
                  isDone
                      ? 'text-accent'
                  // 진행 중/휴식 중: 모드에 따라 색 구분
                  : isActiveTimer && activeTimerMode === 'pomodoro'
                    ? 'text-state-error'        // 뽀모도로: 빨간색
                    : 'text-accent'    // 일반: 초록색
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
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-disabled transition-colors hover:bg-hover-strong hover:text-text-secondary"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      {/* 메모 표시 */}
      {note && (
        <div className="ml-6 mt-2">
          <div
            className="cursor-pointer rounded-lg bg-state-warning-subtle border border-[var(--color-warning)] px-2 py-1"
            onClick={onOpenNote}
          >
            <p className={`${userTextDisplayClass} text-text-secondary`}>{note}</p>
          </div>
        </div>
      )}
    </div>
  )
}
