import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { formatDateKey, formatDateWithWeekday } from '../lib/time'

export type ViewMode = 'day' | 'week' | 'month' | 'year'

type DateMarks = Record<string, { done: number; total: number }>

type CalendarProps = {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  onMonthChange: (date: Date) => void
  markedDates?: DateMarks
  viewModes?: ViewMode[]
  defaultViewMode?: ViewMode
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  showIndicators?: boolean
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const VIEW_LABELS: Record<ViewMode, string> = {
  day: '일',
  week: '주',
  month: '월',
  year: '연',
}
const STEP_LABELS: Record<ViewMode, { prev: string; next: string }> = {
  day: { prev: '이전 날', next: '다음 날' },
  week: { prev: '이전 주', next: '다음 주' },
  month: { prev: '이전 달', next: '다음 달' },
  year: { prev: '이전 해', next: '다음 해' },
}

// 토요일 파랑, 일요일 빨강. 색조는 예전 cal-saturday/cal-sunday 그대로 두고 글자 대비(4.5:1)를 지키는 짙은 단계를 쓴다
// (라이트 #1d4ed8 6.7, #b91c1c 6.5 / 다크 #93c5fd, #fca5a5)
const SATURDAY_TEXT = 'text-state-info-text'
const SUNDAY_TEXT = 'text-state-error-text'

function weekendTextClass(date: Date) {
  const dayOfWeek = date.getDay()
  if (dayOfWeek === 6) return SATURDAY_TEXT
  if (dayOfWeek === 0) return SUNDAY_TEXT
  return null
}

/** 월요일 시작 월 그리드. 첫 주 앞은 null로 채운다 */
function getMonthDays(year: number, month: number) {
  let startDayOfWeek = new Date(year, month, 1).getDay() - 1
  if (startDayOfWeek < 0) startDayOfWeek = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days: (Date | null)[] = Array.from({ length: startDayOfWeek }, () => null)
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i))
  return days
}

function getWeekDays(date: Date) {
  const day = date.getDay()
  // 월요일 기준으로 주의 시작일 계산
  const monday = new Date(date)
  monday.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

type CalendarDayGridProps = {
  days: (Date | null)[]
  selectedDateKey: string
  onSelect: (date: Date) => void
  markedDates?: DateMarks
  showIndicators?: boolean
  todayDateKey?: string
  // planner: 계획 달력(둥근 사각 칸, 남은 개수와 옅은 바탕). picker: 날짜 선택 시트(원 칸, 고른 날은 진하게 채운다)
  variant?: 'planner' | 'picker'
}

// 날짜 칸 이름: "10월 20일 화요일", 다른 해면 연도를 붙인다. 오늘과 남은 개수의 뜻은 뒤에 글자로 붙인다
function dateCellLabel(date: Date, isToday: boolean, mark: { done: number; total: number } | null) {
  return [
    formatDateWithWeekday(date),
    isToday ? '오늘' : null,
    mark ? (mark.done === mark.total ? '모두 완료' : `남은 할 일 ${mark.total - mark.done}개`) : null,
  ].filter(Boolean).join(' ')
}

function WeekdayHeader({ variant }: { variant: 'planner' | 'picker' }) {
  if (variant === 'picker') {
    return (
      <div className="mb-4 grid grid-cols-7 text-center text-xs font-semibold text-text-tertiary">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
    )
  }
  return (
    <div className="mb-2 grid grid-cols-7 gap-1">
      {WEEKDAYS.map((day, i) => (
        <div
          key={day}
          className={`text-center text-xs font-medium ${
            i === 5 ? SATURDAY_TEXT : i === 6 ? SUNDAY_TEXT : 'text-text-tertiary'
          }`}
        >
          {day}
        </div>
      ))}
    </div>
  )
}

// 요일 머리 + 날짜 칸. 계획 달력(주/월)과 날짜 선택 시트가 같이 쓴다.
// 칸 안의 숫자, "오늘", 남은 개수는 aria-hidden이고 같은 뜻을 칸 이름(aria-label)으로 읽는다
export function CalendarDayGrid({
  days,
  selectedDateKey,
  onSelect,
  markedDates = {},
  showIndicators = true,
  todayDateKey = formatDateKey(new Date()),
  variant = 'planner',
}: CalendarDayGridProps) {
  const isPicker = variant === 'picker'
  return (
    <div>
      <WeekdayHeader variant={variant} />

      <div className={isPicker ? 'grid grid-cols-7 gap-y-2' : 'grid grid-cols-7 gap-x-1 gap-y-1.5'}>
        {days.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className={isPicker ? 'h-11' : 'aspect-square'} />

          const dateKey = formatDateKey(date)
          const rawMark = showIndicators ? markedDates[dateKey] : undefined
          const mark = rawMark && rawMark.total > 0 ? rawMark : null
          const allDone = !!mark && mark.done === mark.total
          const isSelected = dateKey === selectedDateKey
          const isTodayDate = dateKey === todayDateKey
          const weekendText = weekendTextClass(date)
          const label = dateCellLabel(date, isTodayDate, mark)

          if (isPicker) {
            // 면을 칠하지 않는다(사용자 결정 2026-10-20): 고른 날은 계획 달력처럼 초록 테두리, 오늘은 숫자 아래 "오늘"만
            const toneClass = isSelected
              ? `ring-2 ring-inset ring-accent font-semibold ${weekendText ?? 'text-text-primary'}`
              : `hover:bg-hover-strong ${weekendText ?? 'text-text-primary'}`
            return (
              <button
                key={dateKey}
                type="button"
                aria-pressed={isSelected}
                aria-label={label}
                onClick={() => onSelect(date)}
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-base font-medium transition-colors ${toneClass}`}
              >
                <span aria-hidden className="flex flex-col items-center leading-none">
                  <span>{date.getDate()}</span>
                  {isTodayDate && (
                    <span className="mt-0.5 text-[11px] font-semibold text-accent-text">
                      오늘
                    </span>
                  )}
                </span>
              </button>
            )
          }

          // 할 일이 있는 날도 면을 칠하지 않고 숫자 아래 남은 개수(모두 끝나면 ✓)만 둔다(사용자 결정 2026-10-20)
          const textClass = isSelected
            ? 'font-semibold text-text-primary'
            : weekendText ?? 'text-text-secondary'

          return (
            <button
              key={dateKey}
              type="button"
              aria-pressed={isSelected}
              aria-label={label}
              onClick={() => onSelect(date)}
              // 보이는 칸은 375에서 40px. 터치 영역만 사방 2px 넓혀 44를 맞춘다(칸 사이 4/6px라 이웃과 겹치지 않는다)
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors after:absolute after:-inset-0.5 ${textClass} ${
                isSelected ? 'ring-2 ring-accent' : 'hover:ring-2 hover:ring-border-default'
              }`}
            >
              {isTodayDate && (
                <span aria-hidden className="text-[9px] font-semibold leading-none text-accent-text">
                  오늘
                </span>
              )}
              <span aria-hidden>{date.getDate()}</span>
              {mark && (
                <span
                  aria-hidden
                  className={`mt-0.5 text-[11px] font-medium leading-none ${allDone ? 'text-accent-text' : 'text-text-secondary'}`}
                >
                  {allDone ? '✓' : mark.total - mark.done}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type CalendarMonthGridProps = Omit<CalendarDayGridProps, 'days'> & {
  // 보여 줄 달(날짜는 무시한다)
  month: Date
}

/** 한 달 그리드. 날짜 선택 시트처럼 헤더를 따로 그리는 곳에서 쓴다 */
export function CalendarMonthGrid({ month, ...props }: CalendarMonthGridProps) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const days = useMemo(() => getMonthDays(year, monthIndex), [year, monthIndex])
  return <CalendarDayGrid days={days} {...props} />
}

// 헤더의 작은 버튼들. 보이는 크기는 예전 그대로 두고 터치 영역(after)만 넓혀 44×44를 맞춘다.
// 이웃한 버튼의 넓힌 영역은 서로 닿기만 하고 겹치지 않는다: 이전(32 + 왼쪽 12), 4px 띄워 다음(왼쪽 4 + 32 + 오른쪽 8),
// 20px 띄워 월/주(30 + 바깥쪽 14씩). 375에서는 이전의 왼쪽 영역이 오늘 알약과 몇 px 겹칠 수 있어 알약을 위에 둔다(z-10)
const ARROW_BASE =
  'relative flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-hover-strong after:absolute after:-inset-y-1.5'
const SEGMENT_BASE =
  'relative rounded-full px-2.5 py-1 text-xs font-medium transition-colors after:absolute after:-inset-y-2.5'

export function Calendar({
  selectedDate,
  onSelectDate,
  onMonthChange,
  markedDates = {},
  viewModes,
  defaultViewMode,
  viewMode: controlledViewMode,
  onViewModeChange,
  showIndicators = true,
}: CalendarProps) {
  const allowedViewModes = viewModes && viewModes.length > 0
    ? viewModes
    : (['month', 'week'] as ViewMode[])
  const fallbackMode = defaultViewMode && allowedViewModes.includes(defaultViewMode)
    ? defaultViewMode
    : allowedViewModes[0]
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>(fallbackMode)
  const viewMode = controlledViewMode ?? internalViewMode
  const year = selectedDate.getFullYear()
  const month = selectedDate.getMonth()
  const todayDateKey = formatDateKey(new Date())
  const selectedDateKey = formatDateKey(selectedDate)
  const isSelectedToday = selectedDateKey === todayDateKey

  const monthDays = useMemo(() => getMonthDays(year, month), [year, month])
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate])
  const monthMarks = useMemo(() => {
    if (viewMode !== 'year') return []
    const stats = Array.from({ length: 12 }, () => ({ done: 0, total: 0 }))
    Object.entries(markedDates).forEach(([dateKey, mark]) => {
      const [y, m] = dateKey.split('-').map(Number)
      if (y === year && Number.isFinite(m) && m >= 1 && m <= 12) {
        stats[m - 1].done += mark.done
        stats[m - 1].total += mark.total
      }
    })
    return stats
  }, [markedDates, viewMode, year])

  const setViewMode = (nextMode: ViewMode) => {
    if (!allowedViewModes.includes(nextMode)) return
    if (!controlledViewMode) setInternalViewMode(nextMode)
    onViewModeChange?.(nextMode)
  }

  // 월/주 전환은 radiogroup이다: 고른 칸만 Tab으로 들어오고, 방향키로 옮기면 바로 고른다
  const segmentRefs = useRef<Array<HTMLButtonElement | null>>([])
  const handleSegmentKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    e.preventDefault()
    const nextIndex = (index + delta + allowedViewModes.length) % allowedViewModes.length
    segmentRefs.current[nextIndex]?.focus()
    setViewMode(allowedViewModes[nextIndex])
  }

  const step = (direction: 1 | -1) => {
    if (viewMode === 'month') {
      onMonthChange(new Date(year, month + direction, 1))
      return
    }
    if (viewMode === 'year') {
      onMonthChange(new Date(year + direction, 0, 1))
      return
    }
    const newDate = new Date(selectedDate)
    newDate.setDate(selectedDate.getDate() + direction * (viewMode === 'week' ? 7 : 1))
    onMonthChange(newDate)
  }

  // 오늘을 고르면 "오늘" 버튼이 그 자리에서 숨으므로, 키보드 포커스가 body로 떨어지지 않게 연월 제목으로 옮긴다
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const goToToday = () => {
    onSelectDate(new Date())
    onMonthChange(new Date())
    headingRef.current?.focus()
  }

  // 스와이프 핸들링
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return

    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current

    // 수평 스와이프가 수직보다 클 때만 처리. 오른쪽으로 밀면 이전, 왼쪽으로 밀면 다음
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      step(deltaX > 0 ? -1 : 1)
    }

    touchStartX.current = null
    touchStartY.current = null
  }

  return (
    <div
      className="rounded-card border border-card-border bg-surface-card p-card"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 헤더: 왼쪽 연월과 오늘, 오른쪽 이전/다음과 월/주. 오른쪽 묶음은 예전처럼 카드 안쪽 여백으로 조금 내민다 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="whitespace-nowrap text-lg font-bold text-text-primary focus:outline-none">
            {viewMode === 'year' ? `${year}년` : `${year}년 ${month + 1}월`}
          </h2>
          {/* 바탕 없는 초록 글자 버튼(사용자 결정 2026-10-20). 보이는 높이 24, 터치 영역만 위아래 10px, 왼쪽(제목 쪽) 4px 넓힌다.
              오늘을 고른 동안에는 눌러도 할 일이 없어 숨긴다. 예전처럼 자리는 남겨 두어 오늘과 다른 날 사이에 헤더가 움직이지 않는다 */}
          <button
            type="button"
            onClick={goToToday}
            aria-hidden={isSelectedToday || undefined}
            tabIndex={isSelectedToday ? -1 : undefined}
            className={`relative z-10 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold text-accent-text transition-colors hover:bg-hover-strong after:absolute after:-left-1 after:right-0 after:-inset-y-2.5 ${
              isSelectedToday ? 'invisible' : ''
            }`}
          >
            오늘
          </button>
        </div>
        <div className="-mr-3 flex shrink-0 items-center">
          <button
            type="button"
            aria-label={STEP_LABELS[viewMode].prev}
            onClick={() => step(-1)}
            className={`${ARROW_BASE} after:-left-3 after:right-0`}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={STEP_LABELS[viewMode].next}
            onClick={() => step(1)}
            className={`${ARROW_BASE} ml-1 after:-left-1 after:-right-2`}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          {allowedViewModes.length <= 3 ? (
            <div role="radiogroup" aria-label="달력 보기" className="ml-5 inline-flex rounded-full bg-surface-sunken p-0.5">
              {allowedViewModes.map((mode, index) => {
                const active = mode === viewMode
                const isFirst = index === 0
                const isLast = index === allowedViewModes.length - 1
                return (
                  <button
                    key={mode}
                    ref={(node) => {
                      segmentRefs.current[index] = node
                    }}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${VIEW_LABELS[mode]} 보기`}
                    tabIndex={active || (!allowedViewModes.includes(viewMode) && isFirst) ? 0 : -1}
                    onClick={() => setViewMode(mode)}
                    onKeyDown={(e) => handleSegmentKeyDown(e, index)}
                    className={`${SEGMENT_BASE} ${isFirst ? 'after:-left-3.5' : 'after:left-0'} ${isLast ? 'after:-right-3.5' : 'after:right-0'} ${
                      active
                        ? 'bg-surface-card text-text-primary shadow-sm'
                        : 'text-text-secondary'
                    }`}
                  >
                    {VIEW_LABELS[mode]}
                  </button>
                )
              })}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const currentIndex = allowedViewModes.indexOf(viewMode)
                const nextIndex = currentIndex === -1
                  ? 0
                  : (currentIndex + 1) % allowedViewModes.length
                setViewMode(allowedViewModes[nextIndex] ?? viewMode)
              }}
              className="relative ml-5 rounded-full bg-surface-sunken px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-hover-strong after:absolute after:-inset-x-1 after:-inset-y-2"
            >
              {VIEW_LABELS[viewMode]}
            </button>
          )}
        </div>
      </div>

      {viewMode === 'year' ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, index) => {
            const date = new Date(year, index, 1)
            const isSelected = date.getMonth() === selectedDate.getMonth()
            const mark = monthMarks[index]
            const hasData = (mark?.total ?? 0) > 0
            const isComplete = hasData && mark?.done === mark?.total

            return (
              <button
                key={String(index)}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onSelectDate(date)
                  onMonthChange(date)
                }}
                className={`flex flex-col items-center justify-center rounded-xl border border-border-subtle px-3 py-3 text-sm font-medium transition-all ${
                  isSelected ? 'ring-2 ring-accent ring-offset-2' : 'hover:bg-hover'
                }`}
              >
                <span className="text-text-secondary">{index + 1}월</span>
                {showIndicators && hasData && (
                  <span className={`mt-2 h-2 w-2 rounded-full ${isComplete ? 'bg-accent-fill' : 'bg-state-warning'}`} />
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <CalendarDayGrid
          days={viewMode === 'month' ? monthDays : weekDays}
          selectedDateKey={selectedDateKey}
          onSelect={onSelectDate}
          markedDates={markedDates}
          showIndicators={showIndicators}
          todayDateKey={todayDateKey}
        />
      )}
    </div>
  )
}
