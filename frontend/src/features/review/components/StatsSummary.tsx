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
    return <span className="text-gray-400">변화 없음</span>
  }
  const sign = value > 0 ? '+' : '-'
  const absValue = Math.abs(value)
  const formatted = unitFormatter ? unitFormatter(absValue) : String(absValue)
  return (
    <span className={value > 0 ? 'text-blue-500' : 'text-rose-500'}>
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
  const focusDelta = comparison?.focusDelta

  return (
    <section className="rounded-2xl bg-white p-2 shadow-sm">
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500">집중</p>
          <p className="mt-1 text-base font-semibold text-emerald-600">
            {formatFocusTime(totalFocusSeconds)}
          </p>
          {focusDelta !== undefined && (
            <p className="mt-0.5 text-[10px]">
              {renderDelta(focusDelta, formatFocusTime)}
            </p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500">Flow</p>
          <p className="mt-1 text-base font-semibold text-emerald-600">{totalFlows}회</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500">완료</p>
          <p className="mt-1 text-base font-semibold text-emerald-600">{completedCount}개</p>
        </div>
      </div>
    </section>
  )
}
