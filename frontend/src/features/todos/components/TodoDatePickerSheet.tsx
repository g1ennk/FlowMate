import { useMemo, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { CalendarMonthGrid } from '../../../ui/Calendar'
import { ChevronLeftIcon, ChevronRightIcon } from '../../../ui/Icons'
import { formatDateKey } from '../../../lib/time'
import { parseDateKey } from '../todoDateActionHelpers'

type TodoDatePickerSheetProps = {
  isOpen: boolean
  mode: 'move' | 'duplicate' | null
  // 어떤 할 일의 날짜를 고르는지 제목 아래에 보인다(메뉴 시트를 닫고 왔으므로)
  todoTitle?: string
  currentDateKey: string | null
  selectedDateKey: string
  onSelectDateKey: (dateKey: string) => void
  onClose: () => void
  onConfirm: () => void
}

type MonthPickerProps = {
  initialVisibleMonth: Date
  selectedDateKey: string
  onSelectDateKey: (dateKey: string) => void
}

// 월 그리드는 계획 달력과 같은 부품(ui/Calendar)의 picker 모양을 쓰고, 달 이동 헤더만 시트 안에 따로 둔다.
// 모양은 예전 시트 그대로다: 큰 연월 제목, 원 화살표, 고른 날은 진하게 채운 원
const ARROW_CLASS =
  'relative flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-strong after:absolute after:-inset-y-1'

function MonthPicker({ initialVisibleMonth, selectedDateKey, onSelectDateKey }: MonthPickerProps) {
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialVisibleMonth.getFullYear(), initialVisibleMonth.getMonth(), 1),
  )
  const moveMonth = (step: number) =>
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + step, 1))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between px-1">
        <h3 className="text-xl font-semibold text-text-primary">
          {visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월
        </h3>
        {/* 보이는 36에 터치 영역만 넓혀 44: 이전은 왼쪽 8, 4px 띄운 다음은 양옆 4 */}
        <div className="flex items-center gap-1">
          <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)} className={`${ARROW_CLASS} after:-left-2 after:right-0`}>
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)} className={`${ARROW_CLASS} after:-inset-x-1`}>
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      <CalendarMonthGrid
        variant="picker"
        month={visibleMonth}
        selectedDateKey={selectedDateKey}
        onSelect={(date) => onSelectDateKey(formatDateKey(date))}
        showIndicators={false}
      />
    </div>
  )
}

export function TodoDatePickerSheet({
  isOpen,
  mode,
  todoTitle,
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
  const calendarKey = `${isOpen ? 'open' : 'closed'}:${mode ?? 'none'}:${currentDateKey ?? ''}`
  const title = mode === 'duplicate' ? '다른 날 또 하기' : '날짜 바꾸기'
  const confirmLabel = mode === 'duplicate' ? '새로 추가' : '이 날짜로 이동'
  const confirmDisabled = mode === 'move' && currentDateKey === selectedDateKey

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      {todoTitle && (
        <p className="mb-card truncate text-center text-sm text-text-secondary">{todoTitle}</p>
      )}
      <MonthPicker
        key={calendarKey}
        initialVisibleMonth={initialVisibleMonth}
        selectedDateKey={selectedDateKey}
        onSelectDateKey={onSelectDateKey}
      />
      <Button fullWidth className="mt-sheet" onClick={onConfirm} disabled={confirmDisabled}>
        {confirmLabel}
      </Button>
    </BottomSheet>
  )
}
