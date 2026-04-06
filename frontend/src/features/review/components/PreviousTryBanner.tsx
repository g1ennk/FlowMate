import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReview, useReviewList } from '../hooks'
import { aiReportApi } from '../../../api/aiReport'
import { queryKeys } from '../../../lib/queryKeys'
import { extractTry } from '../kptParser'
import type { PeriodType } from '../reviewTypes'
import { formatDateKey } from '../../../lib/time'
import { useAuthStore } from '../../../store/authStore'

type PreviousTryBannerProps = {
  periodType: PeriodType
  previousPeriodStart: string
  onNavigateToPrevious?: () => void
}

export function PreviousTryBanner({
  periodType,
  previousPeriodStart,
  onNavigateToPrevious,
}: PreviousTryBannerProps) {
  const isMember = useAuthStore((s) => s.state?.type === 'member')
  const { data: prevReview } = useReview(periodType, previousPeriodStart)
  const { data: prevAiReport } = useQuery({
    queryKey: queryKeys.aiReport(periodType, previousPeriodStart),
    queryFn: () => aiReportApi.get(periodType, previousPeriodStart),
    staleTime: Infinity,
    enabled: isMember,
    retry: false,
  })

  // 일간: 어제 회고가 없으면 최근 7일 내 가장 가까운 회고에서 Try 탐색
  const dailyFallbackFrom = useMemo(() => {
    if (periodType !== 'daily') return ''
    const d = new Date(previousPeriodStart)
    d.setDate(d.getDate() - 6)
    return formatDateKey(d)
  }, [periodType, previousPeriodStart])

  const directTry = prevReview?.content ? extractTry(prevReview.content) : null
  const needsFallback = periodType === 'daily' && !directTry && !prevAiReport?.try

  const { data: recentDailyReviews } = useReviewList(
    'daily',
    dailyFallbackFrom,
    previousPeriodStart,
    { enabled: needsFallback },
  )

  const tryText = useMemo(() => {
    // 1순위: 직전 기간 회고의 [Try]
    if (directTry) return directTry

    // 2순위: 직전 기간 AI 레포트의 try
    if (prevAiReport?.try) return prevAiReport.try

    // 3순위 (일간만): 최근 7일 내 가장 가까운 회고의 [Try]
    if (needsFallback && recentDailyReviews?.items) {
      const sorted = [...recentDailyReviews.items]
        .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      for (const r of sorted) {
        const t = extractTry(r.content)
        if (t) return t
      }
    }

    return null
  }, [directTry, prevAiReport, needsFallback, recentDailyReviews])

  if (!tryText) return null

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card p-card shadow-sm">
      <p className="mb-1.5 text-xs font-semibold text-text-tertiary">
        💬 지난번 목표
      </p>
      <p className="text-sm leading-relaxed text-text-secondary">
        &ldquo;{tryText}&rdquo;
      </p>
      {onNavigateToPrevious && (
        <button
          type="button"
          onClick={onNavigateToPrevious}
          className="mt-1.5 text-xs font-medium text-text-tertiary hover:text-text-secondary"
        >
          이전 회고 보기
        </button>
      )}
    </div>
  )
}
