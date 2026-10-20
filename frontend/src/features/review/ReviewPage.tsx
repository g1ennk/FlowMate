import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDateKey } from '../../lib/time'
import { systemMessages } from '../../lib/messages'
import { isWaitingOffline } from '../../lib/queryStatus'
import { useTodos } from '../todos/hooks'
import { useReview } from './hooks'
import { InlineStatus } from '../../ui/InlineStatus'
import { Card } from '../../ui/Card'
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
import { SessionDetailSheet } from './components/SessionDetailSheet'
import {
  buildPeriodStats,
  buildDailyGroups,
  buildStatDeltas,
  getPeriodRange,
  shiftBaseDate,
  formatPeriodLabel,
  buildTasksByDate,
  buildReviewPlaceholder,
} from './reviewUtils'
import { getReviewRouteState } from './reviewRouteParams'
import type { TaskItem } from './reviewTypes'
import { ReviewSkeleton } from '../../ui/Skeleton'
import { PageHeader } from '../../ui/PageHeader'

const DIARY_TITLES: Record<ReturnType<typeof getReviewRouteState>['period'], string> = {
  daily: '일간 회고',
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
  const todosQuery = useTodos()
  const { data, isLoading, isError, isFetching, refetch } = todosQuery
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

  const reviewRange = useMemo(() => getPeriodRange(period, baseDate), [period, baseDate])
  const today = new Date()
  const todayKey = formatDateKey(today)
  const currentWeekStartKey = getPeriodRange('weekly', today).startKey
  const currentMonthStartKey = getPeriodRange('monthly', today).startKey

  const tasksByDate = useMemo(
    () => buildTasksByDate(todos ?? [], runningIds, reviewRange),
    [todos, runningIds, reviewRange],
  )
  const dailyTasks = period === 'daily' ? tasksByDate[reviewRange.startKey] ?? [] : []
  // 날마다 한 묶음. 월간은 TimelineList가 이것을 주로 다시 묶는다(주 → 날짜)
  const dayGroups = period === 'daily' ? [] : buildDailyGroups(tasksByDate, reviewRange)
  const isPastPeriod = reviewRange.endKey < todayKey
  const miniDayLabels = [
    { id: 0, label: '미분류' },
    { id: 1, label: miniDaysSettings.day1.label },
    { id: 2, label: miniDaysSettings.day2.label },
    { id: 3, label: miniDaysSettings.day3.label },
  ]

  // 탭을 바꿔도 보고 있던 날짜를 기준으로 그 주와 그 달을 보여 준다.
  // 방향키로 기간을 훑어도 뒤로 가기 기록이 쌓이지 않게 replace한다.
  const handlePeriodChange = (nextPeriod: typeof period) => {
    setSearchParams({ period: nextPeriod, date: dateKey }, { replace: true, preventScrollReset: true })
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

  const isToday = dateKey === todayKey
  const diaryTitle = period === 'daily' && isToday ? '오늘 회고' : DIARY_TITLES[period]
  // 할 일을 불러오지 못했는데 보여 줄 데이터도 없으면 0건처럼 보이지 않게 실패를 알린다.
  // 오프라인으로 열어 아직 못 불러왔으면(paused) 0건처럼 보이지 않게 오프라인이라고 알린다. 연결되면 저절로 불러온다
  const isTodosOffline = isWaitingOffline(todosQuery)
  const isTodosLoadError = (isError && !data) || isTodosOffline
  // 회고도 오프라인으로 기다리는 중이면 회고 자리에서 "회고와 기록"을 한 줄로 알리고, 아래에서 같은 말을 되풀이하지 않는다
  const isReviewOffline = isWaitingOffline(useReview(period, reviewRange.startKey))

  // 기간 고르기와 날짜 이동은 데이터와 상관없으니 불러오는 동안에도 그대로 보여 준다.
  // 둘은 한 묶음이라 카드 한 장에 담는다. 날짜가 위, 기간 고르기가 아래이고 사이는 목록 행과 같은 가는 선으로 나눈다(사용자 결정 2026-10-20)
  const periodControls = (
    <Card>
      <PeriodNavigator
        period={period}
        label={formatPeriodLabel(period, baseDate)}
        isCurrent={isCurrentPeriod}
        onJumpToCurrent={handleJumpToCurrent}
        onPrev={handlePrev}
        onNext={handleNext}
      />
      <div className="mt-card-item border-t border-border-subtle pt-card-item">
        <PeriodTabs value={period} onChange={handlePeriodChange} />
      </div>
    </Card>
  )

  if (isLoading) {
    return (
      <div className="space-y-section">
        <PageHeader title="회고" />
        {periodControls}
        <ReviewSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-section">
      <PageHeader title="회고" />
      {periodControls}

      {isTodosOffline ? (
        !isReviewOffline && (
          <Card>
            <InlineStatus kind="waiting" message={systemMessages.offlineLoadFailed('기록')} />
          </Card>
        )
      ) : isTodosLoadError ? (
        <Card>
          <InlineStatus
            message="기록을 불러오지 못했어요"
            actionLabel="다시 시도"
            onAction={() => void refetch()}
            actionDisabled={isFetching}
          />
        </Card>
      ) : (
        <StatsSummary
          totalFocusSeconds={stats.totalFocusSeconds}
          totalFlows={stats.totalFlows}
          completedCount={stats.completedCount}
          deltas={buildStatDeltas(period, reviewRange, todayKey, stats.comparison)}
          isCurrentPeriod={isCurrentPeriod}
        />
      )}

      {!isTodosLoadError && period === 'daily' && (
        <DailyTaskList
          tasks={dailyTasks}
          isToday={isToday}
          miniDayLabels={miniDayLabels}
          onSelectTask={setSelectedTask}
        />
      )}

      {!isTodosLoadError && period !== 'daily' && (
        <TimelineList
          key={`timeline-${period}-${reviewRange.startKey}`}
          title="타임라인"
          viewMode={period}
          groups={dayGroups}
          miniDayLabels={miniDayLabels}
          onSelectTask={setSelectedTask}
          todayKey={todayKey}
          isPastPeriod={isPastPeriod}
        />
      )}

      {/* 회고는 그 기간의 숫자와 한 일을 다 본 뒤에 쓰도록 맨 아래에 둔다(통계 → 할 일 기록 → 회고, 사용자 결정 2026-10-21) */}
      <ReviewTextarea
        key={`review-${period}-${reviewRange.startKey}`}
        title={diaryTitle}
        periodType={period}
        periodStart={reviewRange.startKey}
        periodEnd={reviewRange.endKey}
        completedTodoCount={stats.completedCount}
        totalSessionCount={stats.totalFlows}
        placeholder={buildReviewPlaceholder(period, {
          focusCount: stats.totalFlows,
          completedCount: stats.completedCount,
          isCurrent: isCurrentPeriod,
        })}
        canRequestAi={!isTodosLoadError}
        todosOffline={isTodosOffline}
      />

      <SessionDetailSheet
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  )
}
