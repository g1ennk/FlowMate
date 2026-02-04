import { formatFocusTime } from '../reviewUtils'
import type { PeriodComparison } from '../reviewTypes'

type StatsSummaryProps = {
  totalFocusSeconds: number
  totalFlows: number
  completedCount: number
  comparison?: PeriodComparison
}

const formatDelta = (value: number, unitFormatter?: (value: number) => string) => {
  if (value === 0) return '변화 없음'
  const sign = value > 0 ? '+' : '-'
  const absValue = Math.abs(value)
  const formatted = unitFormatter ? unitFormatter(absValue) : String(absValue)
  return `${sign}${formatted}`
}

const getDeltaStyle = (value: number) => {
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-500'
  return 'text-gray-400'
}

export function StatsSummary({
  totalFocusSeconds,
  totalFlows,
  completedCount,
  comparison,
}: StatsSummaryProps) {
  const focusDelta = comparison?.focusDelta
  const flowDelta = comparison?.flowDelta
  const completedDelta = comparison?.completedDelta

  return (
    <section className="rounded-2xl bg-white p-2 shadow-sm">
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500">집중</p>
          <p className="mt-1 text-base font-semibold text-gray-900">{formatFocusTime(totalFocusSeconds)}</p>
          {focusDelta !== undefined && (
            <p className={`mt-0.5 text-[10px] ${getDeltaStyle(focusDelta)}`}>
              {formatDelta(focusDelta, formatFocusTime)}
            </p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500">Flow</p>
          <p className="mt-1 text-base font-semibold text-gray-900">{totalFlows}회</p>
          {flowDelta !== undefined && (
            <p className={`mt-0.5 text-[10px] ${getDeltaStyle(flowDelta)}`}>
              {formatDelta(flowDelta, (value) => `${value}회`)}
            </p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[11px] text-gray-500">완료</p>
          <p className="mt-1 text-base font-semibold text-gray-900">{completedCount}개</p>
          {completedDelta !== undefined && (
            <p className={`mt-0.5 text-[10px] ${getDeltaStyle(completedDelta)}`}>
              {formatDelta(completedDelta, (value) => `${value}개`)}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
