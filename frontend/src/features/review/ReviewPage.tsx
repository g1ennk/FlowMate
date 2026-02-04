import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatDateKey } from '../../ui/calendarUtils'
import { useTodos } from '../todos/hooks'
import { useTimerStore } from '../timer/timerStore'
import { useMiniDaysSettings } from '../settings/hooks'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { Calendar } from '../../ui/Calendar'
import { StatsSummary } from './components/StatsSummary'
import { TimeflowChart } from './components/TimeflowChart'
import { ReviewDiary } from './components/ReviewDiary'
import { useReviewList } from './hooks'
import type { MiniDayGroup } from './reviewTypes'
import {
  buildPeriodStats,
  getCalendarRange,
  getPeriodRange,
} from './reviewUtils'
import { buildReviewQuery, getReviewRouteState, VIEW_MODE_PERIODS } from './reviewRouteParams'
import { useReviewScrollMemory } from './useReviewScrollMemory'

const getChartTitle = (type: ReturnType<typeof getReviewRouteState>['period']) => {
  if (type === 'daily') return '시간대별 흐름'
  if (type === 'weekly') return '요일별 흐름'
  if (type === 'monthly') return '주차별 흐름'
  return '월별 흐름'
}

const getDiaryTitle = (type: ReturnType<typeof getReviewRouteState>['period']) => {
  if (type === 'daily') return '오늘 회고'
  if (type === 'weekly') return '주간 회고'
  if (type === 'monthly') return '월간 회고'
  return '연간 회고'
}

export function ReviewPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useTodos()
  const timers = useTimerStore((state) => state.timers)
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()
  const [searchParams, setSearchParams] = useSearchParams()

  const { period, dateKey, baseDate, viewMode } = getReviewRouteState(searchParams)
  useReviewScrollMemory(`home:${period}:${dateKey}`)

  const stats = buildPeriodStats(
    data?.items ?? [],
    timers,
    period,
    baseDate,
    miniDaysSettings,
  )

  const reviewRange = getPeriodRange(period, baseDate)
  const calendarRange = getCalendarRange(viewMode, baseDate)
  const { data: reviewList } = useReviewList(period, calendarRange.startKey, calendarRange.endKey)

  const markedDates: Record<string, { done: number; total: number }> = {}
  if (period !== 'yearly') {
    for (const review of reviewList?.items ?? []) {
      markedDates[review.periodStart] = { done: 1, total: 1 }
    }
  }

  const hasYearlyReview =
    period === 'yearly' &&
    (reviewList?.items ?? []).some((item) => item.periodStart === reviewRange.startKey)
  const groups = [
    { id: 0, label: '미분류' },
    { id: 1, label: miniDaysSettings.day1.label },
    { id: 2, label: miniDaysSettings.day2.label },
    { id: 3, label: miniDaysSettings.day3.label },
  ]
  const miniDayGroups: MiniDayGroup[] = groups.map((group) => ({
    id: group.id,
    label: group.label,
    completed: stats.completedTodos.filter((item) => (item.miniDay ?? 0) === group.id),
    incomplete: stats.incompleteTodos.filter((item) => (item.miniDay ?? 0) === group.id),
  }))

  const handleViewModeChange = (nextMode: keyof typeof VIEW_MODE_PERIODS) => {
    const nextPeriod = VIEW_MODE_PERIODS[nextMode]
    setSearchParams({ period: nextPeriod, date: dateKey })
  }

  const handleSelectDate = (nextDate: Date) => {
    const nextKey = formatDateKey(nextDate)
    setSearchParams({ period, date: nextKey })
  }

  const openDiaryPage = () => {
    navigate(`/review/diary?${buildReviewQuery(period, dateKey)}`)
  }

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
        viewModes={['day', 'week', 'month', 'year']}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        showIndicators
      />

      {period === 'yearly' && hasYearlyReview && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          연간 회고 작성됨
        </div>
      )}

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
        periodStart={reviewRange.startKey}
        miniDayGroups={miniDayGroups}
        onOpen={openDiaryPage}
      />
    </div>
  )
}
