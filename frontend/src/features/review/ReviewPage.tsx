import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDateKey } from '../../lib/time'
import { useTodos } from '../todos/hooks'
import { useTimerStore } from '../timer/timerStore'
import type { SingleTimerState } from '../timer/timerStore'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { useMiniDaysSettings } from '../settings/hooks'
import { StatsSummary } from './components/StatsSummary'
import { PeriodNavigator } from './components/PeriodNavigator'
import { PeriodTabs } from './components/PeriodTabs'
import { DailyTaskList } from './components/DailyTaskList'
import { TimelineList } from './components/TimelineList'
import { ReviewTextarea } from './components/ReviewTextarea'
import { PreviousTryBanner } from './components/PreviousTryBanner'
import { SessionDetailSheet } from './components/SessionDetailSheet'
import {
  buildPeriodStats,
  buildDailyGroups,
  buildWeeklyGroups,
  getPeriodRange,
  getPreviousPeriodStart,
  shiftBaseDate,
  formatPeriodLabel,
  buildTasksByDate,
} from './reviewUtils'
import { useReview, useReviewList } from './hooks'
import { getReviewRouteState } from './reviewRouteParams'
import type { TaskItem } from './reviewTypes'
import { useCoachMark } from '../../lib/useCoachMark'
import { CoachMark } from '../../ui/CoachMark'
import { ReviewSkeleton } from '../../ui/Skeleton'

const DIARY_TITLES: Record<ReturnType<typeof getReviewRouteState>['period'], string> = {
  daily: '하루 회고',
  weekly: '주간 회고',
  monthly: '월간 회고',
}

function selectRunningTodoKey(timers: Record<string, SingleTimerState>): string {
  return Object.keys(timers)
    .filter((id) => timers[id].status === 'running')
    .sort()
    .join(',')
}

export function ReviewPage() {
  const { data, isLoading, isError, isFetching, refetch } = useTodos()
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()
  // 타이머는 250ms마다 갱신되지만 회고에는 "지금 실행 중인 할 일"만 필요하다.
  // 문자열로 구독해 실행 여부가 바뀔 때만 다시 그린다.
  const runningKey = useTimerStore((state) => selectRunningTodoKey(state.timers))
  const runningIds = useMemo(
    () => new Set(runningKey ? runningKey.split(',') : []),
    [runningKey],
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTask, setSelectedTask] = useState<null | TaskItem>(null)

  // baseDate가 렌더마다 새 Date가 되지 않도록 URL이 바뀔 때만 다시 만든다.
  const { period, dateKey, baseDate } = useMemo(
    () => getReviewRouteState(searchParams),
    [searchParams],
  )

  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    const rawPeriod = searchParams.get('period')
    const rawDate = searchParams.get('date')
    if (rawPeriod !== period || rawDate !== dateKey) {
      setSearchParams({ period, date: dateKey }, { replace: true, preventScrollReset: true })
    }
  }, [dateKey, period, searchParams, setSearchParams])

  const todos = data?.items
  const stats = useMemo(
    () => buildPeriodStats(todos ?? [], runningIds, period, baseDate),
    [todos, runningIds, period, baseDate],
  )

  const reviewRange = getPeriodRange(period, baseDate)
  const { data: currentReview } = useReview(period, reviewRange.startKey)
  const today = new Date()
  const todayKey = formatDateKey(today)
  const currentWeekStartKey = getPeriodRange('weekly', today).startKey
  const currentMonthStartKey = getPeriodRange('monthly', today).startKey

  const monthRange = getPeriodRange('monthly', baseDate)
  const { data: monthlyReviews } = useReviewList('daily', monthRange.startKey, monthRange.endKey)
  const monthlyReviewCount = monthlyReviews?.items?.length ?? 0
  const tasksByDate = useMemo(
    () => buildTasksByDate(todos ?? [], runningIds, getPeriodRange(period, baseDate)),
    [todos, runningIds, period, baseDate],
  )
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

  // 탭을 바꿔도 보고 있던 날짜를 기준으로 그 주와 그 달을 보여 준다.
  const handlePeriodChange = (nextPeriod: typeof period) => {
    setSearchParams({ period: nextPeriod, date: dateKey }, { preventScrollReset: true })
  }

  const handlePrev = () => {
    const nextDate = shiftBaseDate(period, baseDate, -1)
    setSearchParams({ period, date: formatDateKey(nextDate) }, { preventScrollReset: true })
  }

  const handleNext = () => {
    const nextDate = shiftBaseDate(period, baseDate, 1)
    setSearchParams({ period, date: formatDateKey(nextDate) }, { preventScrollReset: true })
  }

  const isCurrentPeriod =
    (period === 'daily' && dateKey === todayKey) ||
    (period === 'weekly' && reviewRange.startKey === currentWeekStartKey) ||
    (period === 'monthly' && reviewRange.startKey === currentMonthStartKey)

  const handleJumpToCurrent = () => {
    setSearchParams({ period, date: todayKey }, { preventScrollReset: true })
  }

  const PERIOD_LABELS: Record<typeof period, { badge: string; jump: string }> = {
    daily: { badge: '오늘', jump: '오늘로 이동' },
    weekly: { badge: '이번 주', jump: '이번 주로 이동' },
    monthly: { badge: '이번 달', jump: '이번 달로 이동' },
  }
  const currentJumpLabel = PERIOD_LABELS[period].jump
  const isToday = dateKey === todayKey
  const diaryTitle = period === 'daily' && isToday ? '오늘 회고' : DIARY_TITLES[period]
  // 할 일을 불러오지 못했는데 보여 줄 데이터도 없으면 0건처럼 보이지 않게 실패를 알린다.
  const isTodosLoadError = isError && !data

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
        reviewCount={monthlyReviewCount}
      />

      {isTodosLoadError ? (
        <div
          role="alert"
          className="mt-section flex items-center justify-between gap-card-item rounded-2xl bg-state-error-subtle px-4 py-3"
        >
          <p className="text-sm font-medium text-state-error">기록을 불러오지 못했어요</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-accent-subtle disabled:cursor-not-allowed disabled:text-text-disabled"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="mt-section">
          <StatsSummary
            totalFocusSeconds={stats.totalFocusSeconds}
            totalFlows={stats.totalFlows}
            completedCount={stats.completedCount}
            comparison={stats.comparison}
            isCurrentPeriod={isCurrentPeriod}
            hasReview={!!currentReview?.content}
            onScrollToReview={() =>
              document.getElementById('review-card')?.scrollIntoView({ behavior: 'smooth' })
            }
          />
        </div>
      )}

      {!isTodosLoadError && period === 'daily' && (
        <DailyTaskList
          tasks={dailyTasks}
          isToday={isToday}
          miniDayLabels={miniDayLabels}
          onSelectTask={setSelectedTask}
        />
      )}

      {!isTodosLoadError && period === 'weekly' && (
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

      {!isTodosLoadError && period === 'monthly' && (
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

      <PreviousTryBanner
        periodType={period}
        previousPeriodStart={getPreviousPeriodStart(period, baseDate)}
        onNavigateToPrevious={() => {
          const prevDate = shiftBaseDate(period, baseDate, -1)
          setSearchParams({ period, date: formatDateKey(prevDate) }, { preventScrollReset: true })
        }}
      />

      <div id="review-card">
        <ReviewTextarea
          key={`review-${period}-${reviewRange.startKey}`}
          title={diaryTitle}
          periodType={period}
          periodStart={reviewRange.startKey}
          periodEnd={reviewRange.endKey}
          completedTodoCount={stats.completedCount}
          totalSessionCount={stats.totalFlows}
        />
      </div>

      <SessionDetailSheet
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  )
}
