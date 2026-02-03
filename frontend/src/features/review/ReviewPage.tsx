import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTodos } from '../todos/hooks'
import { useTimerStore } from '../timer/timerStore'
import { useMiniDaysSettings } from '../settings/hooks'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { Calendar, type ViewMode } from '../../ui/Calendar'
import { StatsSummary } from './components/StatsSummary'
import { TimeflowChart } from './components/TimeflowChart'
import { ReviewDiary } from './components/ReviewDiary'
// import { SessionDetailSheet } from './components/SessionDetailSheet'
import { useReviewList } from './hooks'
import type { PeriodType, MiniDayGroup } from './reviewTypes'
import {
  buildPeriodStats,
  getCalendarRange,
  getPeriodRange,
  parseDateKey,
} from './reviewUtils'
import { formatDateKey } from '../../ui/calendarUtils'

// const PERIODS: PeriodType[] = ['daily', 'weekly', 'monthly', 'yearly']
const PERIODS: PeriodType[] = ['daily']
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

const resolvePeriod = (value: string | null): PeriodType =>
  value && PERIODS.includes(value as PeriodType) ? (value as PeriodType) : 'daily'

const resolveDateKey = (value: string | null) =>
  value && DATE_KEY_RE.test(value) ? value : formatDateKey(new Date())

const PERIOD_VIEW_MODES: Partial<Record<PeriodType, ViewMode>> = {
  daily: 'day',
  // weekly: 'week',
  // monthly: 'month',
  // yearly: 'year',
}

const VIEW_MODE_PERIODS: Partial<Record<ViewMode, PeriodType>> = {
  day: 'daily',
  // week: 'weekly',
  // month: 'monthly',
  // year: 'yearly',
}

const getChartTitle = (type: PeriodType) => {
  if (type === 'daily') return '시간대별 흐름'
  // if (type === 'weekly') return '요일별 흐름'
  // if (type === 'monthly') return '주차별 흐름'
  // return '월별 흐름'
  return '시간대별 흐름'
}

const getDiaryTitle = (type: PeriodType) => {
  if (type === 'daily') return '오늘 회고'
  // if (type === 'weekly') return '주간 회고'
  // if (type === 'monthly') return '월간 회고'
  // return '연간 회고'
  return '오늘 회고'
}

export function ReviewPage() {
  const { data, isLoading } = useTodos()
  const timers = useTimerStore((state) => state.timers)
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  // const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  // const [isSessionOpen, setIsSessionOpen] = useState(false)

  const period = resolvePeriod(searchParams.get('period'))
  const dateKey = resolveDateKey(searchParams.get('date'))
  const baseDate = parseDateKey(dateKey)
  const viewMode = PERIOD_VIEW_MODES[period] ?? 'day'

  const stats = useMemo(() => {
    const items = data?.items ?? []
    return buildPeriodStats(items, timers, period, baseDate, miniDaysSettings)
  }, [data?.items, timers, period, baseDate, miniDaysSettings])

  const reviewRange = getPeriodRange(period, baseDate)
  const calendarRange = getCalendarRange(viewMode, baseDate)
  const { data: reviewList } = useReviewList(period, calendarRange.startKey, calendarRange.endKey)
  const markedDates = useMemo(() => {
    const marks: Record<string, { done: number; total: number }> = {}
    for (const review of reviewList?.items ?? []) {
      marks[review.periodStart] = { done: 1, total: 1 }
    }
    return marks
  }, [reviewList?.items])

  const handleViewModeChange = (nextMode: ViewMode) => {
    const nextPeriod = VIEW_MODE_PERIODS[nextMode] ?? period
    setSearchParams({ period: nextPeriod, date: dateKey })
  }

  const handleSelectDate = (nextDate: Date) => {
    const nextKey = formatDateKey(nextDate)
    setSearchParams({ period, date: nextKey })
  }

  // const handleTaskSelect = (task: TaskItem) => {
  //   setSelectedTask(task)
  //   setIsSessionOpen(true)
  // }

  // const handleSessionClose = () => {
  //   setIsSessionOpen(false)
  // }

  const range = reviewRange

  const miniDayGroups = useMemo<MiniDayGroup[]>(() => {
    if (period !== 'daily') return []
    const groups = [
      { id: 0, label: '미분류' },
      { id: 1, label: miniDaysSettings.day1.label },
      { id: 2, label: miniDaysSettings.day2.label },
      { id: 3, label: miniDaysSettings.day3.label },
    ]
    return groups.map((group) => ({
      id: group.id,
      label: group.label,
      completed: stats.completedTodos.filter((item) => (item.miniDay ?? 0) === group.id),
      incomplete: stats.incompleteTodos.filter((item) => (item.miniDay ?? 0) === group.id),
    }))
  }, [period, miniDaysSettings, stats.completedTodos, stats.incompleteTodos])

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-400">
        회고를 불러오는 중...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Calendar
        selectedDate={baseDate}
        onSelectDate={handleSelectDate}
        onMonthChange={handleSelectDate}
        markedDates={markedDates}
        viewModes={['day']}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        showIndicators
      />

      <StatsSummary
        totalFocusSeconds={stats.totalFocusSeconds}
        totalFlows={stats.totalFlows}
        completedCount={stats.completedCount}
        comparison={stats.comparison}
      />

      <TimeflowChart
        title={getChartTitle(period)}
        data={stats.distribution}
      />

      <ReviewDiary
        title={getDiaryTitle(period)}
        type={period}
        periodStart={range.startKey}
        periodEnd={range.endKey}
        miniDayGroups={miniDayGroups}
        // onSelectTask={handleTaskSelect}
      />

      {/*
      <SessionDetailSheet
        task={selectedTask}
        isOpen={isSessionOpen}
        onClose={handleSessionClose}
      />
      */}
    </div>
  )
}
