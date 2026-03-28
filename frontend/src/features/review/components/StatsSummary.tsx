import { formatFocusTime } from '../reviewUtils'
import type { PeriodComparison } from '../reviewTypes'

type StatsSummaryProps = {
  totalFocusSeconds: number
  totalFlows: number
  completedCount: number
  comparison?: PeriodComparison
}

const renderDelta = (value: number, unitFormatter?: (value: number) => string) => {
  if (value === 0) {
    return <span className="text-text-tertiary">변화 없음</span>
  }
  const sign = value > 0 ? '+' : '-'
  const absValue = Math.abs(value)
  const formatted = unitFormatter ? unitFormatter(absValue) : String(absValue)
  return (
    <span className={value > 0 ? 'text-accent' : 'text-state-error'}>
      {`${sign}${formatted}`}
    </span>
  )
}

export function StatsSummary({
  totalFocusSeconds,
  totalFlows,
  completedCount,
  comparison,
}: StatsSummaryProps) {
  const isEmpty = totalFocusSeconds === 0 && totalFlows === 0 && completedCount === 0

  if (isEmpty) {
    return (
      <section className="rounded-2xl bg-surface-card p-card shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-text-primary">집중 기록</h3>
        <p className="py-2 text-center text-sm text-text-tertiary">
          첫 Flow를 시작하면 집중 시간과 완료 기록이 여기에 표시돼요
        </p>
      </section>
    )
  }

  const focusDelta = comparison?.focusDelta
  const focusLabel = totalFocusSeconds >= 60
    ? formatFocusTime(totalFocusSeconds)
    : totalFocusSeconds > 0
      ? '1분 미만'
      : '0분'

  return (
    <section className="rounded-2xl bg-surface-card p-card shadow-sm">
      <h3 className="mb-card-item text-sm font-semibold text-text-primary">집중 기록</h3>
      <div className="grid grid-cols-3 divide-x divide-border-subtle">
        <div className="px-3 py-2">
          <p className="text-[11px] text-text-secondary">집중</p>
          <p className="mt-2 text-lg font-bold text-accent">
            {focusLabel}
          </p>
          {focusDelta !== undefined && (
            <p className="mt-1 text-[11px] text-text-tertiary">
              {renderDelta(focusDelta, formatFocusTime)}
            </p>
          )}
        </div>
        <div className="flex flex-col justify-center px-3 py-2">
          <p className="text-[11px] text-text-secondary">Flow</p>
          <p className="mt-2 text-sm font-medium text-accent">{totalFlows}회</p>
        </div>
        <div className="flex flex-col justify-center px-3 py-2">
          <p className="text-[11px] text-text-secondary">완료</p>
          <p className="mt-2 text-sm font-medium text-accent">{completedCount}개</p>
        </div>
      </div>
    </section>
  )
}
