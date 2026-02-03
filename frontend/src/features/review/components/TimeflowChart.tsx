import { useState } from 'react'
import type { DistributionBucket } from '../reviewTypes'
import { formatFocusTime } from '../reviewUtils'

type TimeflowChartProps = {
  title: string
  data: DistributionBucket[]
  onBarSelect?: (item: DistributionBucket, index: number) => void
}

export function TimeflowChart({ title, data, onBarSelect }: TimeflowChartProps) {
  const max = Math.max(0, ...data.map((item) => item.seconds))
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activeItem = activeIndex !== null ? data[activeIndex] : null
  const barWidthClass = data.length <= 7
    ? 'w-8'
    : data.length <= 12
      ? 'w-4'
      : data.length <= 31
        ? 'w-2'
        : 'w-1.5'
  const gapClass = data.length <= 7
    ? 'gap-2'
    : data.length <= 12
      ? 'gap-2'
      : data.length <= 31
        ? 'gap-1'
        : 'gap-1'
  const trackHeightClass = data.length <= 12 ? 'h-32' : 'h-28'
  const labelClass = data.length <= 12 ? 'text-xs' : 'text-[10px]'

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {activeItem && (
          <span className="text-xs font-semibold text-emerald-600">
            {formatFocusTime(activeItem.seconds)}
          </span>
        )}
      </div>
      <div
        className={`mt-5 flex items-end ${gapClass}`}
        onMouseLeave={() => setActiveIndex(null)}
      >
        {data.length === 0 && (
          <p className="text-sm text-gray-400">표시할 데이터가 없습니다.</p>
        )}
        {data.map((item, index) => {
          const ratio = max > 0 ? Math.round((item.seconds / max) * 100) : 0
          const height = item.seconds > 0 ? Math.max(6, ratio) : 0
          return (
            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`relative flex items-end justify-center rounded-full bg-gray-100 ${trackHeightClass} ${barWidthClass}`}
                role="button"
                tabIndex={0}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => {
                  setActiveIndex(index)
                  onBarSelect?.(item, index)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    setActiveIndex(index)
                    onBarSelect?.(item, index)
                  }
                }}
                aria-label={`${item.label} ${formatFocusTime(item.seconds)}`}
              >
                <div
                  className="w-full rounded-full bg-emerald-500"
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className={`${labelClass} font-medium text-gray-500`}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
