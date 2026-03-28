import { useMemo } from 'react'
import { userTextDisplayClass } from '../../../lib/userTextStyles'
import type { MiniDayGroup, PeriodType } from '../reviewTypes'
import { useReview } from '../hooks'

type ReviewDiaryProps = {
  title: string
  type: PeriodType
  periodStart: string
  miniDayGroups: MiniDayGroup[]
  onOpen: () => void
}

export function ReviewDiary({
  title,
  type,
  periodStart,
  miniDayGroups,
  onOpen,
}: ReviewDiaryProps) {
  const { data, isLoading } = useReview(type, periodStart)

  const content = useMemo(() => data?.content ?? '', [data?.content])
  const totalTasks = useMemo(
    () => miniDayGroups.reduce((sum, group) => sum + group.completed.length + group.incomplete.length, 0),
    [miniDayGroups],
  )

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl bg-surface-card p-card text-left shadow-sm transition-colors hover:bg-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-xs text-text-tertiary">태스크 {totalTasks}개 기반으로 기록됩니다.</p>
        </div>
        <span className="text-xs font-semibold text-accent">{content ? '열기' : '작성'}</span>
      </div>

      <p className={`mt-3 line-clamp-2 ${userTextDisplayClass} text-text-primary`}>
        {isLoading ? '회고를 불러오는 중...' : content || '짧게라도 남겨두면 다음 회고가 훨씬 쉬워집니다.'}
      </p>
    </button>
  )
}
