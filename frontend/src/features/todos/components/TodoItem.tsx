import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckIcon, ClockIcon, PlayIcon } from '../../../ui/Icons'
import { IconButton } from '../../../ui/IconButton'
import { isImeComposing } from '../../../lib/keyboard'
import { userTextTitleClass } from '../../../lib/userTextStyles'
import { linkifyText } from '../linkifyText'
import { getTodoDisplayTimeSeconds, isTodoDisplayTimeRemaining } from '../todoTimerDisplay'
import { formatRunningTime, formatStoppedTime } from '../../../lib/time'
import { useTimerStore, type TimerMode } from '../../timer/timerStore'
import { showsStartButton } from '../timerStartRules'
import { getTimerInfo } from '../../timer/useTimerInfo'

const MAX_TITLE_LENGTH = 200

// border-box라 scrollHeight(테두리 제외)에 위아래 테두리를 더해야 글자가 잘리지 않는다
function resizeTextarea(node: HTMLTextAreaElement) {
  node.style.height = 'auto'
  node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`
}

// 행 안의 메모 글자. 제목(14, text-primary)보다 한 단계 작고 연하게(12, text-tertiary 흰 면 대비 4.8:1) 써서
// 제목과 메모가 확실히 구분된다(사용자 결정 2026-10-20). 줄바꿈 규칙은 userTextDisplayClass와 같다
const NOTE_TEXT_CLASS = 'text-xs leading-5 break-keep break-words whitespace-pre-wrap text-text-tertiary'

// 행 안에서 따로 눌리는 곳(시간 줄 버튼, 넘치는 메모). 마우스를 올리면 행 전체 회색 면(bg-hover) 대신 그곳만 한 단계 진한 작은 면을 켠다
// (사용자 결정 2026-10-20). 면은 글자 양옆 4px(-mx-1 px-1), 위아래 2px(그림자 두 줄)만 넓혀 글자 자리가 움직이지 않는다.
// 행은 data-row-subtarget 요소에 마우스가 있으면(has-[]) 자기 면을 끈다. Tailwind v4 hover는 마우스 기기에서만 켜져 터치는 그대로다
const SUBTARGET_HOVER_CLASS =
  '-mx-1 cursor-pointer rounded-control px-1 transition-colors hover:bg-hover-strong hover:shadow-[0_-2px_0_var(--color-hover-strong),0_2px_0_var(--color-hover-strong)]'

export type TodoItemProps = {
  todoId: string
  title: string
  note?: string | null
  sessionFocusSeconds: number
  // 마지막으로 쓴 타이머. 집중 기록 시계 색(일반 초록, 뽀모도로 빨강)과 시작 버튼 아이콘(쓴 적 있으면 시계)을 정한다
  timerMode?: TimerMode | null
  isDone: boolean
  isEditing: boolean
  editingTitle: string
  onEditingTitleChange: (value: string) => void
  onToggle: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onOpenMenu?: () => void
  // 행의 집중 버튼. 시작 전이면 버튼 옆에 타이머를 고르는 메뉴를 띄우고, 이미 시작했으면 타이머를 연다
  onStartFocus?: (anchor: HTMLButtonElement) => void
  // 끝내지 않은 할 일의 시간 줄("집중 26:40", "50분")을 누르면 타이머 화면을 연다
  onOpenTimer?: () => void
  // 완료한 할 일의 시간 줄을 누르면 집중 기록(세션 상세)을 연다(사용자 결정 2026-10-20)
  onOpenSessions?: () => void
  // 이 행의 타이머 고르기 메뉴가 열려 있다(집중 시작 버튼의 aria-expanded)
  isFocusMenuOpen?: boolean
  selectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  // 타이머에서 할 일을 끝내고 돌아왔을 때 다음 할 일을 잠깐 강조한다
  isHighlighted?: boolean
  // 타이머 설정을 불러오는 동안 집중 버튼을 막는다(기본값으로 시작하지 않게)
  focusDisabled?: boolean
}

export function TodoItem({
  todoId,
  title,
  note,
  sessionFocusSeconds,
  timerMode = null,
  isDone,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onToggle,
  onSaveEdit,
  onCancelEdit,
  onOpenMenu,
  onStartFocus,
  onOpenTimer,
  onOpenSessions,
  isFocusMenuOpen = false,
  selectMode = false,
  isSelected = false,
  onSelect,
  isHighlighted = false,
  focusDisabled = false,
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

  // 편집 모드: 자동 높이/포커스 처리
  useEffect(() => {
    if (!isEditing) return
    if (textareaRef.current) resizeTextarea(textareaRef.current)
  }, [isEditing, editingTitle])

  useEffect(() => {
    if (!isEditing) return
    const textarea = textareaRef.current
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, [isEditing])

  // 메모: 접힌 상태에서 한 줄을 넘칠 때만 메모 글자 탭과 키보드용 펼치기 버튼(포커스 때만 보임)을 켠다. 펼친 동안은 마지막 측정값 유지.
  // 제목 편집 중에는 메모 줄이 언마운트되므로 isEditing이 바뀌면 다시 측정한다
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

  const displayTimeArgs = {
    isDone,
    sessionFocusSeconds,
    isActiveTimer,
    activeTimerElapsedMs,
    activeTimerRemainingMs,
    breakElapsedMs,
    breakTargetMs,
    flexiblePhase,
  }
  const totalFocusSeconds = getTodoDisplayTimeSeconds(displayTimeArgs)
  const isRemainingTime = isTodoDisplayTimeRemaining(displayTimeArgs)

  // 멈춘 기록은 "25분", 실행 중 카운트만 "집중 12:30"/"휴식 5:00". 일시정지와 단계 대기는 상태 말을 붙인다.
  // 뽀모도로 일시정지는 남은 시간이라 "집중 일시정지 · 24분 남음"으로 쓴다(바로 전 기록 "25분"이 줄어든 것처럼 읽히지 않게)
  const isActiveDisplay = !isDone && !!isActiveTimer
  const isOnBreak = isActiveDisplay && (isBreakPhase || activeTimerPhase === 'short' || activeTimerPhase === 'long')
  const phaseWord = isOnBreak ? '휴식' : '집중'
  const isRunning = isActiveDisplay && timer?.status === 'running'
  let focusTimeDisplay = formatStoppedTime(totalFocusSeconds)
  if (isActiveDisplay) {
    if (isRunning) focusTimeDisplay = formatRunningTime(isOnBreak ? 'break' : 'focus', totalFocusSeconds)
    else if (timer?.status === 'paused') focusTimeDisplay = `${phaseWord} 일시정지 · ${focusTimeDisplay}${isRemainingTime ? ' 남음' : ''}`
    else if (timer?.status === 'waiting') focusTimeDisplay = isOnBreak ? '집중 끝' : '휴식 끝'
  }
  const shouldShowTime = totalFocusSeconds > 0 || isActiveDisplay
  // 실행 중인 집중은 accent-text, 휴식은 rest-text. 멈춘 기록은 보조 글자, 끝낸 할 일은 더 낮춘다
  // 끝낸 할 일은 tertiary로 가라앉힌다. accent-subtle 배경(강조 행, 고른 행) 위에서는 tertiary가 4.59:1로 기준에 겨우 닿아
  // 취소선까지 겹친 제목과 시간은 secondary로 올린다. 메모 글자(NOTE_TEXT_CLASS)는 취소선이 없어 그 위에서도 tertiary 그대로다
  const onTintedRow = isHighlighted || (selectMode && isSelected)
  // 강조나 고른 행은 accent 면만 둔다. 따로 눌리는 곳도 회색 면을 켜지 않는다
  const subtargetHoverClass = onTintedRow ? 'cursor-pointer rounded-control' : SUBTARGET_HOVER_CLASS
  const doneTextClass = onTintedRow ? 'text-text-secondary' : 'text-text-tertiary'
  const timeColorClass = isRunning
    ? isOnBreak
      ? 'text-rest-text'
      : 'text-accent-text'
    : isDone
      ? doneTextClass
      : 'text-text-secondary'

  // 시계 아이콘은 타이머 종류 색: 일반 타이머 초록, 뽀모도로 빨강(할 일 메뉴의 타이머 아이콘과 같다, 사용자 결정 2026-10-20).
  // 돌고 있으면 지금 타이머 모드를, 아니면 마지막으로 쓴 모드를 따른다. 휴식 중에는 휴식 색이다
  const clockMode = timer?.mode ?? timerMode
  const clockColorClass = isRunning && isOnBreak
    ? 'text-rest-text'
    : clockMode === 'pomodoro' ? 'text-icon-red' : 'text-icon-green'

  // 오른쪽 ▶는 타이머를 한 번도 쓰지 않아 시간 줄이 없는 할 일에만 둔다. 기록이 있거나 진행 중인 할 일은
  // 제목 아래 시간 줄을 눌러 타이머로 가므로 오른쪽 버튼을 따로 두지 않는다(사용자 결정 2026-10-20)
  const showStart = !selectMode && !!onStartFocus && showsStartButton({ isDone, focusSeconds: totalFocusSeconds, hasActiveTimer: isActiveDisplay })

  // 편집 중인 줄: 상자 없이 저장된 행과 같은 열에 글자를 쓰고(캐럿이 단서), 따로 완료 버튼은 두지 않는다.
  // Enter(키보드의 완료/return)나 바깥을 누르면 저장하고 Esc는 취소한다(사용자 결정 2026-10-20)
  if (isEditing) {
    return (
      <div>
        <div className="flex items-start gap-list">
          <span aria-hidden className="flex h-11 w-8 shrink-0 items-center justify-center">
            <span className="h-5 w-5 rounded-full border-2 border-text-tertiary opacity-50" />
          </span>
          <textarea
            ref={textareaRef}
            value={editingTitle}
            maxLength={MAX_TITLE_LENGTH}
            aria-label="할 일 제목"
            onChange={(e) => {
              onEditingTitleChange(e.target.value)
              // 높이 자동 조정
              resizeTextarea(e.target)
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
            className={`min-w-0 flex-1 min-h-11 resize-none overflow-hidden px-0 py-3 ${userTextTitleClass} text-text-primary outline-none`}
            rows={1}
          />
        </div>
        {editingTitle.length >= MAX_TITLE_LENGTH * 0.8 && (
          <p
            className={`pb-list pr-tight text-right text-xs tabular-nums ${
              editingTitle.length >= MAX_TITLE_LENGTH ? 'text-state-error-text' : 'text-text-secondary'
            }`}
          >
            {editingTitle.length}/{MAX_TITLE_LENGTH}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      data-todo-id={todoId}
      data-highlighted={isHighlighted || undefined}
      // 다른 화면의 목록 행(ListRow)처럼 마우스를 올리면 행 전체에 회색 면(bg-hover)을 깐다(사용자 결정 2026-10-20).
      // 단 따로 눌리는 곳(data-row-subtarget) 위에서는 행 면을 끄고 그곳만 자기 면을 켠다(사용자 결정 2026-10-20).
      // Tailwind v4의 hover는 마우스가 있는 기기에서만 켜져 터치에서 눌린 색이 남지 않는다. 강조나 고른 행은 accent 면이 먼저다
      className={`relative -mx-2 rounded-control px-2 transition-colors duration-300 motion-reduce:transition-none ${
        onTintedRow ? 'bg-accent-subtle' : 'hover:not-has-[[data-row-subtarget]:hover]:bg-hover'
      }`}
    >
      {/* 정렬(Task 21): 강조 면은 카드 안쪽 선 밖으로 8 넓히고(-mx-2), 안의 표지는 안쪽 선에 둔다.
          체크는 앞 열(32 칸, 구간 화살표와 같은 열) 가운데, 제목은 글자 열(+40), 집중 버튼은 구간 + 버튼과 같은 오른쪽 끝이다.
          체크와 집중 버튼은 높이 44 칸 가운데라 제목 첫 줄(py-3 + 20) 가운데에 맞는다 */}
      <div className="flex items-start gap-list">
        {/* 체크(보이는 20, 터치 44). 선택 모드에서는 선택 체크가 행 전체를 덮어 어디를 눌러도 고르고,
            고른 행은 accent-subtle 배경으로 완료 표시와 구분한다 */}
        <span className="flex h-11 w-8 shrink-0 items-center justify-center">
          {selectMode ? (
            <button
              type="button"
              onClick={onSelect}
              aria-label={`${title} ${isSelected ? '선택 해제' : '선택'}`}
              aria-pressed={isSelected}
              className="flex after:absolute after:inset-0 after:z-10 after:rounded-control"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  isSelected ? 'border-accent bg-accent text-text-inverse' : 'border-text-tertiary bg-transparent'
                }`}
              >
                {isSelected && <CheckIcon className="h-3 w-3 animate-check-pop" />}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-label={`${title} ${isDone ? '완료 취소' : '완료'}`}
              className="relative flex after:absolute after:-inset-3"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                  isDone ? 'border-accent bg-accent text-text-inverse' : 'border-text-tertiary bg-transparent hover:border-accent'
                }`}
              >
                {isDone && <CheckIcon className="h-3 w-3 animate-check-pop" />}
              </span>
            </button>
          )}
        </span>

        {/* 내용. 제목 버튼의 터치 영역은 이 칸 전체(시간, 메모 글자 포함)로 넓힌다.
            그 위에 따로 눌리는 것은 시간 줄 버튼(타이머 화면), 넘치는 메모 줄(펼치기), 메모 속 링크, 키보드용 펼치기 버튼이다.
            모두 positioned라 덮개 위에 온다. 짧은 메모 줄은 덮개(메뉴) 영역에 남는다 */}
        <div className="relative min-w-0 flex-1 py-3">
          {selectMode ? (
            <span className={`block ${userTextTitleClass} wrap-anywhere ${isDone ? `${doneTextClass} line-through` : 'text-text-primary'}`}>
              {title}
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label={`${title} 메뉴 열기`}
              className="block w-full text-left after:absolute after:inset-0"
            >
              {/* 긴 URL처럼 한 줄에 안 들어가는 단어만 끊고, 한국어와 보통 영어 단어는 중간에서 끊지 않는다 */}
              <span
                className={`block ${userTextTitleClass} wrap-anywhere ${isDone ? `${doneTextClass} line-through` : 'text-text-primary'}`}
              >
                {title}
              </span>
            </button>
          )}

          {/* 끝내지 않은 할 일의 시간 줄(기록이든 진행 중이든)은 곧 타이머로 가는 버튼이다(사용자 결정 2026-10-20). 제목 버튼 덮개 위에 올라와
              자기 탭을 받고, 보이는 높이는 그대로 두고 터치 영역만 넓힌다. 위아래는 이웃 줄(제목, 메모)과의 간격 4px까지만 넓혀
              짧은 메모나 제목 끝을 누른 탭을 가져가지 않는다. 선택 모드에서는 행 고르기가 먼저다 */}
          {/* 완료한 할 일의 시간 줄은 같은 자리에서 집중 기록(세션 상세)을 여는 버튼이다(회고 화면의 시트와 같다, 사용자 결정 2026-10-20) */}
          {shouldShowTime && !selectMode && (isDone ? onOpenSessions : onOpenTimer) ? (
            <button
              type="button"
              data-row-subtarget
              aria-label={isDone ? `${title} 집중 기록 보기` : `${title} 타이머 화면 열기`}
              onClick={isDone ? onOpenSessions : onOpenTimer}
              className={`relative mt-tight flex items-center gap-tight text-xs font-medium tabular-nums after:absolute after:-inset-x-1 after:-inset-y-1 ${subtargetHoverClass} ${timeColorClass}`}
            >
              <ClockIcon className={`h-4 w-4 shrink-0 ${clockColorClass}`} />
              <span>{focusTimeDisplay}</span>
            </button>
          ) : shouldShowTime && (
            <p className={`mt-tight flex items-center gap-tight text-xs font-medium tabular-nums ${timeColorClass}`}>
              <ClockIcon className={`h-4 w-4 shrink-0 ${clockColorClass}`} />
              <span>{focusTimeDisplay}</span>
            </p>
          )}

          {/* 메모: 상자 없이 제목 아래 보조 글자 한 줄. 넘치면 메모 글자를 눌러 펼치고 접는다(펼침 아이콘 없음, 사용자 결정 2026-10-20).
              넘치는 메모 줄은 relative라 제목 버튼 덮개 위에서 자기 탭을 받고, 짧은 메모는 덮개(메뉴) 영역에 남는다.
              링크는 그대로 새 탭으로 열고 펼치지 않는다. 키보드와 스크린리더는 포커스 때만 보이는 버튼을 쓴다. 메모를 고치는 길은 메뉴의 "메모"다 */}
          {note && (
            <div className="mt-tight">
              <p
                ref={noteRef}
                data-row-subtarget={isNoteClamped || undefined}
                className={`min-w-0 ${NOTE_TEXT_CLASS} [&_a]:relative ${isNoteOpen ? '' : 'line-clamp-1'} ${
                  isNoteClamped ? `relative ${subtargetHoverClass}` : ''
                }`}
                onClick={
                  isNoteClamped
                    ? (e) => {
                        if ((e.target as HTMLElement).closest('a')) return
                        setIsNoteOpen((prev) => !prev)
                      }
                    : undefined
                }
              >
                {linkifyText(note)}
              </p>
              {isNoteClamped && (
                <button
                  type="button"
                  aria-expanded={isNoteOpen}
                  // 선택 모드에서 행 전체를 덮는 선택 덮개(z-10)보다 위에 둔다
                  className="sr-only z-20 text-xs text-text-secondary focus-visible:not-sr-only focus-visible:relative"
                  onClick={() => setIsNoteOpen((prev) => !prev)}
                >
                  {isNoteOpen ? '메모 접기' : '메모 펼치기'}
                </button>
              )}
            </div>
          )}
        </div>

        {showStart && (
          <span className="flex h-11 shrink-0 items-center">
            <IconButton
              label={`${title} 집중 시작`}
              onClick={(e) => onStartFocus?.(e.currentTarget)}
              disabled={focusDisabled}
              aria-haspopup="menu"
              aria-expanded={isFocusMenuOpen}
            >
              <PlayIcon />
            </IconButton>
          </span>
        )}
      </div>
    </div>
  )
}
