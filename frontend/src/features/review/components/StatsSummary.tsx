import { Card } from '../../../ui/Card'
import { EmptyState } from '../../../ui/EmptyState'
import { SectionHeader } from '../../../ui/SectionHeader'
import { formatFocusLabel, type StatDelta, type StatDeltas } from '../reviewUtils'

type StatsSummaryProps = {
  totalFocusSeconds: number
  totalFlows: number
  completedCount: number
  // 끝난 기간에만 오는 칸별 증감(buildStatDeltas). 없으면(진행 중인 기간) 증감 줄을 두지 않는다
  deltas?: StatDeltas | null
  isCurrentPeriod?: boolean
}

// 집중 기록 카드. 사용자 결정(2026-10-20)으로 바꾸기 전 통계 카드 모양을 되살렸다: 세 칸을 세로선으로 나누고,
// 칸마다 작은 라벨 아래 초록 숫자(accent-text, 4.5:1 이상)를 둔다. 끝난 기간이면 숫자 아래 증감을 붙인다:
// 늘면 accent-text, 줄거나 같으면 무채색(§4-2, 빨강 아님). 보이는 글자는 "+25분"이고 스크린리더는 비교 대상까지 읽는다.
// 집중 횟수 점과 "회고 쓰기" 링크는 두지 않는다. .impeccable.md §2-2(점), §8 회고(숫자 stat text-primary)와 다른 곳이다
function StatCell({ label, value, delta }: { label: string; value: string; delta?: StatDelta }) {
  return (
    <div className="min-w-0 px-3 py-2 first:pl-0 last:pr-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-list break-keep text-sm font-medium tabular-nums text-accent-text">{value}</p>
      {delta && (
        <p className={`mt-tight break-keep text-xs tabular-nums ${delta.trend === 'up' ? 'text-accent-text' : 'text-text-secondary'}`}>
          <span aria-hidden="true">{delta.text}</span>
          <span className="sr-only">{delta.label}</span>
        </p>
      )}
    </div>
  )
}

export function StatsSummary({
  totalFocusSeconds,
  totalFlows,
  completedCount,
  deltas,
  isCurrentPeriod = true,
}: StatsSummaryProps) {
  const isEmpty = totalFocusSeconds === 0 && totalFlows === 0 && completedCount === 0

  return (
    <section>
      <SectionHeader title="집중 기록" />
      {isEmpty ? (
        <Card>
          <EmptyState message={isCurrentPeriod ? '아직 집중 기록이 없어요' : '이 기간에는 집중 기록이 없어요'} className="py-0" />
        </Card>
      ) : (
        <Card>
          <div data-stat-grid className="grid grid-cols-3 divide-x divide-border-subtle">
            <StatCell label="집중 시간" value={formatFocusLabel(totalFocusSeconds)} delta={deltas?.focus} />
            <StatCell label="집중 횟수" value={`${totalFlows}회`} delta={deltas?.flow} />
            <StatCell label="완료" value={`${completedCount}개`} delta={deltas?.completed} />
          </div>
        </Card>
      )}
    </section>
  )
}
