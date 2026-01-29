import { useMemo, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { formatDateKey } from './calendarUtils'

type ViewMode = 'month' | 'week'

type CalendarProps = {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  onMonthChange: (date: Date) => void
  markedDates?: Record<string, { done: number; total: number }>
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // 월요일 기준 (0 = 월요일)
  let startDayOfWeek = firstDay.getDay() - 1
  if (startDayOfWeek < 0) startDayOfWeek = 6

  const days: (Date | null)[] = []

  // 이전 달 빈 칸
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null)
  }

  // 이번 달 날짜
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i))
  }

  return days
}

function getWeekDays(date: Date) {
  const day = date.getDay()
  // 월요일 기준으로 주의 시작일 계산
  const monday = new Date(date)
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(date.getDate() + diff)

  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push(d)
  }
  return days
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isToday(date: Date) {
  return isSameDay(date, new Date())
}

export function Calendar({
  selectedDate,
  onSelectDate,
  onMonthChange,
  markedDates = {},
}: CalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const year = selectedDate.getFullYear()
  const month = selectedDate.getMonth()

  const monthDays = useMemo(() => getMonthDays(year, month), [year, month])
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate])

  const days = viewMode === 'month' ? monthDays : weekDays

  const goToPrev = () => {
    if (viewMode === 'month') {
      onMonthChange(new Date(year, month - 1, 1))
    } else {
      const newDate = new Date(selectedDate)
      newDate.setDate(selectedDate.getDate() - 7)
      onMonthChange(newDate)
    }
  }

  const goToNext = () => {
    if (viewMode === 'month') {
      onMonthChange(new Date(year, month + 1, 1))
    } else {
      const newDate = new Date(selectedDate)
      newDate.setDate(selectedDate.getDate() + 7)
      onMonthChange(newDate)
    }
  }

  const goToToday = () => {
    onSelectDate(new Date())
    onMonthChange(new Date())
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

    // 수평 스와이프가 수직보다 클 때만 처리
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        goToPrev() // 오른쪽으로 스와이프 → 이전
      } else {
        goToNext() // 왼쪽으로 스와이프 → 다음
      }
    }

    touchStartX.current = null
    touchStartY.current = null
  }

  return (
    <div
      className="rounded-2xl bg-white p-4 shadow-sm"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 헤더 */}
      <div className="mb-4 grid grid-cols-7 gap-1">
        {/* 왼쪽 영역 (년월, 오늘, 화살표) - 6칸 차지 */}
        <div className="col-span-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              {year}년 {month + 1}월
            </h2>
            {/* 오늘 버튼 */}
            <button
              onClick={goToToday}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                isToday(selectedDate)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
              }`}
            >
              오늘
            </button>
          </div>
          <div className="flex items-center gap-1">
            {/* 화살표 */}
            <button
              onClick={goToPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* 오른쪽 영역 (월/주 버튼) - 일요일 열에 맞춤 */}
        <div className="flex items-center justify-center">
          <button
            onClick={() => setViewMode(viewMode === 'month' ? 'week' : 'month')}
            className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            {viewMode === 'month' ? '월' : '주'}
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className={`text-center text-xs font-medium ${
              i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-400'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="aspect-square" />
          }

          const dateKey = formatDateKey(date)
          const mark = markedDates[dateKey]
          const isSelected = isSameDay(date, selectedDate)
          const isTodayDate = isToday(date)
          const dayOfWeek = date.getDay()
          const isSaturday = dayOfWeek === 6
          const isSunday = dayOfWeek === 0
          
          // 배경색 결정
          let bgColor = ''
          if (mark && mark.total > 0) {
            if (mark.done === mark.total) {
              // 완료: 초록색
              bgColor = 'bg-emerald-100'
            } else {
              // 미완료 (부분 완료 포함): 노란색
              bgColor = 'bg-yellow-50'
            }
          }
          
          // 텍스트 색상 결정
          let textColor = ''
          if (isSelected) {
            textColor = 'text-gray-900 font-semibold'
          } else if (isSaturday) {
            textColor = 'text-blue-500'
          } else if (isSunday) {
            textColor = 'text-red-500'
          } else {
            textColor = 'text-gray-700'
          }

          return (
            <button
              key={dateKey}
              onClick={() => onSelectDate(date)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors ${bgColor} ${textColor} ${
                isSelected ? 'ring-2 ring-emerald-500' : 'hover:ring-2 hover:ring-gray-200'
              }`}
            >
              {/* 오늘 표시 */}
              {isTodayDate && (
                <span className="absolute top-0.5 text-[9px] font-semibold text-emerald-600">
                  오늘
                </span>
              )}
              <span className={isTodayDate ? 'mt-2' : ''}>{date.getDate()}</span>
              {/* 진행도 표시: 남은 개수 또는 완료 체크 */}
              {mark && mark.total > 0 && (
                <span
                  className={`mt-0.5 text-[10px] font-medium leading-none ${
                    mark.done === mark.total
                      ? 'text-emerald-600'
                      : 'text-gray-500'
                  }`}
                >
                  {mark.done === mark.total ? '✓' : mark.total - mark.done}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
