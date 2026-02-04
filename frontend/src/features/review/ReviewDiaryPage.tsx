import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CloseIcon } from '../../ui/Icons'
import { useTodos } from '../todos/hooks'
import { useTimerStore } from '../timer/timerStore'
import { loadSessions } from '../timer/timerPersistence'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { CompletedTaskList } from './components/CompletedTaskList'
import { IncompleteTasks } from './components/IncompleteTasks'
import { useDeleteReview, useReview, useUpsertReview } from './hooks'
import { buildPeriodStats, formatFocusTime, formatPeriodLabel, formatTaskDateLabel, getPeriodRange } from './reviewUtils'
import { buildReviewQuery, getReviewRouteState } from './reviewRouteParams'
import { useReviewScrollMemory } from './useReviewScrollMemory'

export function ReviewDiaryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { period, dateKey, baseDate } = getReviewRouteState(searchParams)
  useReviewScrollMemory(`diary:${period}:${dateKey}`)

  const { data: todosData } = useTodos()
  const timers = useTimerStore((state) => state.timers)

  const stats = buildPeriodStats(
    todosData?.items ?? [],
    timers,
    period,
    baseDate,
    defaultMiniDaysSettings,
  )

  const range = getPeriodRange(period, baseDate)
  const review = useReview(period, range.startKey)
  const upsert = useUpsertReview()
  const remove = useDeleteReview()

  const [draft, setDraft] = useState<string | null>(null)

  const content = review.data?.content ?? ''
  const displayDraft = draft ?? content
  const showDate = period !== 'daily'
  const query = buildReviewQuery(period, dateKey)

  const handleBack = () => {
    navigate(`/review?${query}`)
  }

  const handleSave = () => {
    const trimmed = displayDraft.trim()
    if (!trimmed) {
      if (review.data?.id) {
        remove.mutate(
          { id: review.data.id, type: period, periodStart: range.startKey },
          { onSuccess: handleBack },
        )
      } else {
        handleBack()
      }
      return
    }

    upsert.mutate(
      {
        type: period,
        periodStart: range.startKey,
        periodEnd: range.endKey,
        content: displayDraft,
      },
      { onSuccess: handleBack },
    )
  }

  const getHoverDetails = (taskId: string) => {
    const sessions = loadSessions(taskId)
    if (sessions.length === 0) {
      return []
    }
    return sessions.map(
      (session, index) =>
        `Flow ${index + 1}: ${formatFocusTime(session.sessionFocusSeconds)} · Break ${formatFocusTime(session.breakSeconds)}`,
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="sticky top-0 z-20 -mx-5 border-b border-gray-200 bg-gray-50/95 px-5 pb-3 pt-2 backdrop-blur">
        <div className="grid grid-cols-[44px_1fr_44px] items-center">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
            aria-label="회고 닫기"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <h1 className="text-center text-base font-semibold text-gray-900">
            {period === 'daily' ? '오늘 회고' : period === 'weekly' ? '주간 회고' : period === 'monthly' ? '월간 회고' : '연간 회고'}
          </h1>
          <button
            type="button"
            onClick={handleSave}
            disabled={upsert.isPending || remove.isPending || review.isLoading}
            className="justify-self-end text-sm font-semibold text-emerald-600 disabled:opacity-50"
          >
            완료
          </button>
        </div>
        <p className="mt-1 text-center text-xs text-gray-400">{formatPeriodLabel(period, baseDate)}</p>
      </header>

      <section>
        <CompletedTaskList
          items={stats.completedTodos}
          showDate={showDate}
          formatDateLabel={formatTaskDateLabel}
          getHoverDetails={(item) => getHoverDetails(item.id)}
        />
      </section>

      <section>
        <IncompleteTasks
          items={stats.incompleteTodos}
          showDate={showDate}
          formatDateLabel={formatTaskDateLabel}
          getHoverDetails={(item) => getHoverDetails(item.id)}
        />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">회고</h2>
        <textarea
          value={displayDraft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="무엇이 잘 됐는지, 다음엔 무엇을 바꿀지 적어보세요."
          className="h-48 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </section>
    </div>
  )
}
