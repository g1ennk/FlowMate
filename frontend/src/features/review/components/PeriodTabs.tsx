import { SegmentToggle } from '../../../ui/SegmentToggle'
import type { PeriodType } from '../reviewTypes'

const TABS: Array<{ value: PeriodType; label: string }> = [
  { value: 'daily', label: '일간' },
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
]

type PeriodTabsProps = {
  value: PeriodType
  onChange: (value: PeriodType) => void
}

// 회고 기간 세그먼트. 날짜 이동과 함께 기간 카드 한 장에 담기고(ReviewPage), 카드 안에서 줄을 꽉 채운다(사용자 결정 2026-10-20).
// 흰 카드 안에 회색 트랙을 겹치지 않는다. 고른 기간은 연두 면과 초록 글자로 보인다
export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  return (
    <SegmentToggle ariaLabel="회고 기간" fullWidth track="none" selectedStyle="accent" options={TABS} value={value} onChange={onChange} />
  )
}
