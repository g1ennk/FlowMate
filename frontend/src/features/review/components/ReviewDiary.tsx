import { useMemo } from 'react'
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
      className="w-full rounded-2xl bg-white p-4 text-left shadow-sm transition-colors hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs text-gray-400">태스크 {totalTasks}개 기반으로 기록됩니다.</p>
        </div>
        <span className="text-xs font-semibold text-emerald-600">{content ? '열기' : '작성'}</span>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-gray-900">
        {isLoading ? '회고를 불러오는 중...' : content || '짧게라도 남겨두면 다음 회고가 훨씬 쉬워집니다.'}
      </p>
    </button>
  )
}
