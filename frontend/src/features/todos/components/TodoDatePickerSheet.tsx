import { useMemo, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { ChevronLeftIcon, ChevronRightIcon } from '../../../ui/Icons'
import { formatDateKey } from '../../../lib/time'
import { parseDateKey } from '../todoDateActionHelpers'

type TodoDatePickerSheetProps = {
  isOpen: boolean
  mode: 'move' | 'duplicate' | null
  currentDateKey: string | null
  selectedDateKey: string
  onSelectDateKey: (dateKey: string) => void
  onClose: () => void
  onConfirm: () => void
}

function buildMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  let startDayOfWeek = firstDay.getDay() - 1
  if (startDayOfWeek < 0) startDayOfWeek = 6

  const days: Array<Date | null> = []
  for (let i = 0; i < startDayOfWeek; i += 1) {
    days.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day))
  }

  return days
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

type TodoDatePickerCalendarProps = {
  initialVisibleMonth: Date
  selectedDateKey: string
  todayDateKey: string
  onSelectDateKey: (dateKey: string) => void
}

function TodoDatePickerCalendar({
  initialVisibleMonth,
  selectedDateKey,
  todayDateKey,
  onSelectDateKey,
}: TodoDatePickerCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialVisibleMonth.getFullYear(), initialVisibleMonth.getMonth(), 1),
  )
  const monthDays = useMemo(() => buildMonthDays(visibleMonth), [visibleMonth])

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <p className="text-xl font-semibold text-gray-900">
          {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="이전 달"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() =>
              setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="다음 달"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center text-xs font-semibold text-gray-400">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-2">
        {monthDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-11" />
          }

          const dateKey = formatDateKey(date)
          const isSelected = dateKey === selectedDateKey
          const isToday = dateKey === todayDateKey
          const dayOfWeek = date.getDay()
          const toneClassName =
            dayOfWeek === 0
              ? 'text-rose-400'
              : dayOfWeek === 6
                ? 'text-blue-500'
                : 'text-gray-900'
          const buttonClassName = isSelected
            ? 'bg-gray-950 text-white shadow-sm'
            : isToday
              ? 'bg-gray-100 text-gray-900'
              : `hover:bg-gray-100 ${toneClassName}`

          return (
            <button
              key={dateKey}
              type="button"
              aria-label={`${dateKey} 선택`}
              onClick={() => onSelectDateKey(dateKey)}
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-base font-medium transition-colors ${buttonClassName}`}
            >
              <span className="flex flex-col items-center leading-none">
                <span>{date.getDate()}</span>
                {isToday ? (
                  <span className={`mt-0.5 text-[9px] font-semibold ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                    오늘
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export function TodoDatePickerSheet({
  isOpen,
  mode,
  currentDateKey,
  selectedDateKey,
  onSelectDateKey,
  onClose,
  onConfirm,
}: TodoDatePickerSheetProps) {
  const initialVisibleMonth = useMemo(() => {
    const initial = parseDateKey(selectedDateKey) ?? parseDateKey(currentDateKey ?? '') ?? new Date()
    return new Date(initial.getFullYear(), initial.getMonth(), 1)
  }, [currentDateKey, selectedDateKey])
  const calendarKey = `${isOpen ? 'open' : 'closed'}:${mode ?? 'none'}:${currentDateKey ?? ''}:${selectedDateKey}`
  const todayDateKey = formatDateKey(new Date())
  const title = mode === 'duplicate' ? '다른 날 또 하기' : '날짜 바꾸기'
  const confirmLabel = mode === 'duplicate' ? '새로 추가' : '이 날짜로 이동'
  const confirmDisabled = mode === 'move' && currentDateKey === selectedDateKey

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      panelClassName="min-h-[52dvh]"
      contentClassName="pt-4"
    >
      <div className="space-y-4">
        <TodoDatePickerCalendar
          key={calendarKey}
          initialVisibleMonth={initialVisibleMonth}
          selectedDateKey={selectedDateKey}
          todayDateKey={todayDateKey}
          onSelectDateKey={onSelectDateKey}
        />

        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={`mt-2 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
            confirmDisabled
              ? 'cursor-not-allowed bg-gray-100 text-gray-400'
              : 'bg-gray-950 text-white hover:bg-gray-800'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </BottomSheet>
  )
}
