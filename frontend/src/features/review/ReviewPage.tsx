import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDateKey } from '../../lib/time'
import { useTodos } from '../todos/hooks'
import { useTimerStore } from '../timer/timerStore'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { useMiniDaysSettings } from '../settings/hooks'
import { StatsSummary } from './components/StatsSummary'
import { PeriodNavigator } from './components/PeriodNavigator'
import { PeriodTabs } from './components/PeriodTabs'
import { DailyTaskList } from './components/DailyTaskList'
import { TimelineList } from './components/TimelineList'
import { ReviewTextarea } from './components/ReviewTextarea'
import { SessionDetailSheet } from './components/SessionDetailSheet'
import {
  buildPeriodStats,
  buildDailyGroups,
  buildWeeklyGroups,
  getPeriodRange,
  shiftBaseDate,
  formatPeriodLabel,
  buildTasksByDate,
} from './reviewUtils'
import { getReviewRouteState } from './reviewRouteParams'
import { useReviewScrollMemory } from './useReviewScrollMemory'
import type { TaskItem } from './reviewTypes'
import { useCoachMark } from '../../lib/useCoachMark'
import { CoachMark } from '../../ui/CoachMark'
import { ReviewSkeleton } from '../../ui/Skeleton'

const DIARY_TITLES: Record<ReturnType<typeof getReviewRouteState>['period'], string> = {
  daily: '오늘 회고',
  weekly: '주간 회고',
  monthly: '월간 회고',
}

export function ReviewPage() {
  const { data, isLoading } = useTodos()
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()
  const timers = useTimerStore((state) => state.timers)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTask, setSelectedTask] = useState<null | TaskItem>(null)

  const { period, dateKey, baseDate } = getReviewRouteState(searchParams)
  useReviewScrollMemory(`home:${period}:${dateKey}`)

  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    const rawPeriod = searchParams.get('period')
    const rawDate = searchParams.get('date')
    if (rawPeriod !== period || rawDate !== dateKey) {
      setSearchParams({ period, date: dateKey }, { replace: true })
    }
  }, [dateKey, period, searchParams, setSearchParams])

  const stats = buildPeriodStats(
    data?.items ?? [],
    timers,
    period,
    baseDate,
    miniDaysSettings,
  )

  const reviewRange = getPeriodRange(period, baseDate)
  const today = new Date()
  const todayKey = formatDateKey(today)
  const currentWeekStartKey = getPeriodRange('weekly', today).startKey
  const currentMonthStartKey = getPeriodRange('monthly', today).startKey
  const tasksByDate = buildTasksByDate(data?.items ?? [], timers, reviewRange)
  const dailyTasks = period === 'daily' ? tasksByDate[reviewRange.startKey] ?? [] : []
  const weeklyGroups =
    period === 'weekly' ? buildDailyGroups(tasksByDate, reviewRange) : []
  const monthlyGroups =
    period === 'monthly' ? buildWeeklyGroups(tasksByDate, reviewRange) : []
  const miniDayLabels = [
    { id: 0, label: '미분류' },
    { id: 1, label: miniDaysSettings.day1.label },
    { id: 2, label: miniDaysSettings.day2.label },
    { id: 3, label: miniDaysSettings.day3.label },
  ]

  const handlePeriodChange = (nextPeriod: typeof period) => {
    setSearchParams({ period: nextPeriod, date: formatDateKey(new Date()) })
  }

  const handlePrev = () => {
    const nextDate = shiftBaseDate(period, baseDate, -1)
    setSearchParams({ period, date: formatDateKey(nextDate) })
  }

  const handleNext = () => {
    const nextDate = shiftBaseDate(period, baseDate, 1)
    setSearchParams({ period, date: formatDateKey(nextDate) })
  }

  const isCurrentPeriod =
    (period === 'daily' && dateKey === todayKey) ||
    (period === 'weekly' && reviewRange.startKey === currentWeekStartKey) ||
    (period === 'monthly' && reviewRange.startKey === currentMonthStartKey)

  const handleJumpToCurrent = () => {
    setSearchParams({ period, date: todayKey })
  }

  const PERIOD_LABELS: Record<typeof period, { badge: string; jump: string }> = {
    daily: { badge: '오늘', jump: '오늘로 이동' },
    weekly: { badge: '이번 주', jump: '이번 주로 이동' },
    monthly: { badge: '이번 달', jump: '이번 달로 이동' },
  }
  const currentJumpLabel = PERIOD_LABELS[period].jump

  const reviewCoach = useCoachMark('review-intro')

  if (isLoading) {
    return (
      <div className="animate-fade-in-up space-y-section">
        <PeriodTabs value={period} onChange={handlePeriodChange} />
        <ReviewSkeleton />
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up space-y-section">
      <PeriodTabs value={period} onChange={handlePeriodChange} />

      <CoachMark
        message={"오늘 완료한 할 일과 집중 시간이 여기에 기록돼요.\n일간/주간/월간으로 회고할 수 있어요."}
        visible={reviewCoach.visible}
        onDismiss={reviewCoach.dismiss}
      />

      <PeriodNavigator
        label={formatPeriodLabel(period, baseDate)}
        badge={isCurrentPeriod ? PERIOD_LABELS[period].badge : undefined}
        isCurrent={isCurrentPeriod}
        jumpLabel={currentJumpLabel}
        onJumpToCurrent={handleJumpToCurrent}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      <div className="mt-section">
        <StatsSummary
          totalFocusSeconds={stats.totalFocusSeconds}
          totalFlows={stats.totalFlows}
          completedCount={stats.completedCount}
          comparison={stats.comparison}
        />
      </div>

      {period === 'daily' && (
        <DailyTaskList
          tasks={dailyTasks}
          miniDayLabels={miniDayLabels}
          onSelectTask={setSelectedTask}
        />
      )}

      {period === 'weekly' && (
        <TimelineList
          key={`timeline-weekly-${reviewRange.startKey}`}
          title="타임라인"
          viewMode="weekly"
          groups={weeklyGroups}
          miniDayLabels={miniDayLabels}
          onSelectTask={setSelectedTask}
          todayKey={todayKey}
        />
      )}

      {period === 'monthly' && (
        <TimelineList
          key={`timeline-monthly-${reviewRange.startKey}`}
          title="타임라인"
          viewMode="monthly"
          groups={monthlyGroups}
          miniDayLabels={miniDayLabels}
          onSelectTask={setSelectedTask}
          todayKey={todayKey}
          highlightKey={currentWeekStartKey}
        />
      )}

      <ReviewTextarea
        key={`review-${period}-${reviewRange.startKey}`}
        title={DIARY_TITLES[period]}
        periodType={period}
        periodStart={reviewRange.startKey}
        periodEnd={reviewRange.endKey}
      />

      <SessionDetailSheet
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  )
}
