import { Button } from '../../../ui/Button'
import { IconButton } from '../../../ui/IconButton'
import { ChevronLeftIcon, ChevronRightIcon } from '../../../ui/Icons'
import type { PeriodType } from '../reviewTypes'

// 기간 이동 한 줄. 기간 고르기와 같은 카드 안, 구분선 위에 놓인다(ReviewPage, 사용자 결정 2026-10-20). 지금 기간이 아니면 지금으로 돌아가는 버튼을 보여 준다.

const LABELS: Record<PeriodType, { prev: string; next: string; jump: string }> = {
  daily: { prev: '이전 날', next: '다음 날', jump: '오늘' },
  weekly: { prev: '이전 주', next: '다음 주', jump: '이번 주' },
  monthly: { prev: '이전 달', next: '다음 달', jump: '이번 달' },
}

type PeriodNavigatorProps = {
  period: PeriodType
  label: string
  isCurrent: boolean
  onJumpToCurrent: () => void
  onPrev: () => void
  onNext: () => void
}

export function PeriodNavigator({
  period,
  label,
  isCurrent,
  onJumpToCurrent,
  onPrev,
  onNext,
}: PeriodNavigatorProps) {
  const labels = LABELS[period]
  return (
    // 이전 화살표는 왼쪽 끝, 날짜는 가운데, 다음 화살표는 오른쪽 끝(사용자 결정 2026-10-20).
    // 화살표 버튼 폭이 같아 날짜 묶음이 카드 가운데에 온다. 지금으로 돌아가는 버튼은 날짜 옆에 붙인다
    <div className="flex min-h-11 items-center gap-list">
      <IconButton label={labels.prev} className="-ml-2" onClick={onPrev}>
        <ChevronLeftIcon />
      </IconButton>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-list">
        <p className="min-w-0 break-keep text-center text-base font-semibold text-text-primary">{label}</p>
        {!isCurrent && (
          <Button variant="secondary" size="sm" onClick={onJumpToCurrent}>{labels.jump}</Button>
        )}
      </div>
      <IconButton label={labels.next} className="-mr-2" onClick={onNext}>
        <ChevronRightIcon />
      </IconButton>
    </div>
  )
}
