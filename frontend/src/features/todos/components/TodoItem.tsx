import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  StopIcon,
  MoreVerticalIcon,
} from '../../../ui/Icons'
import { isImeComposing } from '../../../lib/keyboard'
import { userTextDisplayClass, userTextInputClass } from '../../../lib/userTextStyles'
import { linkifyText } from '../linkifyText'
import { formatTimerSeconds, getTodoDisplayTimeSeconds } from '../todoTimerDisplay'
import { useTimerStore } from '../../timer/timerStore'
import { getTimerInfo } from '../../timer/useTimerInfo'

export type TodoItemProps = {
  todoId: string
  title: string
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
  selectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

export function TodoItem({
  todoId,
  title,
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
  selectMode = false,
  isSelected = false,
  onSelect,
}: TodoItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLParagraphElement>(null)
  const [isNoteOpen, setIsNoteOpen] = useState(false)
  const [isNoteClamped, setIsNoteClamped] = useState(false)
  // 메모가 지워지면 다음에 쓰는 메모는 접힌 상태로 시작한다 (렌더 중 prop 변화에 맞춰 state 조정)
  const [hadNote, setHadNote] = useState(!!note)
  if (hadNote !== !!note) {
    setHadNote(!!note)
    if (!note) {
      setIsNoteOpen(false)
      setIsNoteClamped(false)
    }
  }

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

  // 메모: 접힌 상태에서 한 줄을 넘칠 때만 펼치기 버튼을 보인다. 펼친 동안은 마지막 측정값 유지.
  // 제목 편집 중에는 메모 블록이 언마운트되므로 isEditing이 바뀌면 다시 측정한다
  useLayoutEffect(() => {
    const el = noteRef.current
    if (!el || isNoteOpen) return
    let cancelled = false
    const measure = () => {
      if (!cancelled) setIsNoteClamped(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    // 웹폰트가 늦게 적용되면 줄바꿈이 바뀌어도 박스 크기는 그대로라 ResizeObserver가 못 잡는다
    void document.fonts?.ready.then(measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(el)
    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [note, isNoteOpen, isEditing])

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

  const timerColorClass =
    !isDone && isActiveTimer && activeTimerMode === 'pomodoro'
      ? 'text-state-error'
      : 'text-accent'

  const isOnBreak = !isDone && isActiveTimer && (isBreakPhase || activeTimerPhase === 'short' || activeTimerPhase === 'long')

  // 편집 모드
  if (isEditing) {
    return (
      <div className="rounded-xl p-2">
        <div className="flex items-start gap-card-item rounded-lg px-2 py-1 -mx-2 -my-1">
          {/* 체크박스 (비활성) */}
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-border-strong bg-transparent opacity-50 mt-0.5" />

          {/* 입력 필드 */}
          <textarea
            ref={textareaRef}
            value={editingTitle}
            maxLength={200}
            onChange={(e) => {
              onEditingTitleChange(e.target.value)
              // 높이 자동 조정
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (isImeComposing(e)) return
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
        {editingTitle.length >= 160 && (
          <div className="mt-1 px-10 text-right">
            <span className={`text-[11px] tabular-nums ${editingTitle.length >= 200 ? 'text-state-error' : 'text-text-tertiary'}`}>
              {editingTitle.length}/200
            </span>
          </div>
        )}
      </div>
    )
  }

  // 기본 상태
  return (
    <div className="rounded-xl p-2">
      <div
        className="flex items-center gap-card-item rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors hover:bg-hover"
      >
        {/* 체크박스 / 선택 모드 */}
        {selectMode ? (
          <button
            onClick={onSelect}
            aria-label={`${title} ${isSelected ? '선택 해제' : '선택'}`}
            className="-m-2.5 flex shrink-0 items-center justify-center p-2.5"
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
              isSelected
                ? 'border-accent bg-accent text-text-inverse'
                : 'border-border-strong bg-transparent hover:border-accent'
            }`}>
              {isSelected && <CheckIcon className="h-3 w-3 animate-check-pop" strokeWidth={3} />}
            </span>
          </button>
        ) : (
          <button
            onClick={onToggle}
            aria-label={`${title} ${isDone ? '완료 취소' : '완료'}`}
            className="-m-2.5 flex shrink-0 items-center justify-center p-2.5"
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
              isDone
                ? 'border-accent bg-accent text-text-inverse'
                : 'border-border-strong bg-transparent hover:border-accent'
            }`}>
              {isDone && <CheckIcon className="h-3 w-3 animate-check-pop" strokeWidth={3} />}
            </span>
          </button>
        )}

        {/* 내용 */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <button
            type="button"
            onClick={selectMode ? onSelect : onOpenMenu}
            className="inline-flex max-w-full flex-wrap items-center gap-2 text-left"
          >
            <span
              className={`${userTextDisplayClass} break-all ${
                isDone ? 'text-text-tertiary line-through' : 'text-text-primary'
              }`}
            >
              {title}
            </span>
          </button>
          {/* 누적 통계 표시 - 타이머 버튼 */}
          {shouldShowTimerButton && (
            <button
              onClick={onOpenTimer}
              className={`mt-0.5 flex items-center gap-1 rounded-md px-1 -mx-1 py-0.5 transition-colors ${
                isDone ? 'cursor-default' : 'hover:bg-hover cursor-pointer'
              }`}
            >
              {/* 휴식 중이면 Stop 아이콘, 그 외 Clock 아이콘 */}
              {isOnBreak ? (
                <StopIcon className={`h-3.5 w-3.5 shrink-0 ${timerColorClass}`} />
              ) : (
                <ClockIcon className={`h-3.5 w-3.5 shrink-0 ${timerColorClass}`} />
              )}
              {shouldShowTimerTime && (
                <span className={`text-xs font-medium tabular-nums ${timerColorClass}`}>
                  {focusTimeDisplay}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 더보기 버튼 */}
        <button
          onClick={selectMode ? onSelect : onOpenMenu}
          className="-m-2 flex shrink-0 items-center justify-center rounded-full p-2 text-text-disabled transition-colors hover:bg-hover-strong hover:text-text-secondary"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      </div>

      {/* 메모 표시 */}
      {note && (
        <div className="ml-6 mt-2">
          <div
            className="flex cursor-pointer items-start gap-1 rounded-lg bg-state-warning-subtle border border-[var(--color-warning)] px-2 py-1"
            onClick={onOpenNote}
          >
            <p
              ref={noteRef}
              className={`min-w-0 flex-1 ${userTextDisplayClass} text-text-secondary ${isNoteOpen ? '' : 'line-clamp-1'}`}
            >
              {linkifyText(note)}
            </p>
            {isNoteClamped && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsNoteOpen((prev) => !prev)
                }}
                aria-label={isNoteOpen ? '메모 접기' : '메모 펼치기'}
                aria-expanded={isNoteOpen}
                // 높이를 메모 한 줄(1lh)+상하 패딩으로 맞춰 아이콘이 첫 줄 가운데에 오게 한다.
                // 음수 마진으로 보이는 위치는 그대로 두고 터치 영역만 가로 약 40px로 넓힌다
                className="-my-1.5 -ml-3 -mr-2 flex h-[calc(1lh+0.75rem)] shrink-0 cursor-pointer items-center justify-center py-1.5 pl-4 pr-2 text-sm leading-relaxed text-text-secondary transition-colors hover:text-text-primary"
              >
                <ChevronRightIcon
                  className={`h-4 w-4 transition-transform ${isNoteOpen ? '-rotate-90' : 'rotate-90'}`}
                />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
