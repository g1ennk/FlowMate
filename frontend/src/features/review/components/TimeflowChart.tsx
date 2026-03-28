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
  const trackHeightClass = data.length <= 12 ? 'h-28' : 'h-24'
  const labelClass = data.length <= 12 ? 'text-xs' : 'text-[11px]'

  return (
    <div className="rounded-2xl bg-surface-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {activeItem && activeItem.seconds >= 60 && (
          <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold text-accent-text">
            {formatFocusTime(activeItem.seconds)}
          </span>
        )}
      </div>
      <div
        className={`mt-4 flex items-end ${gapClass}`}
        onMouseLeave={() => setActiveIndex(null)}
      >
        {data.length === 0 && (
          <p className="w-full rounded-xl border border-dashed border-border-default px-3 py-4 text-center text-xs text-text-tertiary">
            아직 표시할 집중 기록이 없습니다.
          </p>
        )}
        {data.map((item, index) => {
          const ratio = max > 0 ? Math.round((item.seconds / max) * 100) : 0
          const height = item.seconds > 0 ? Math.max(6, ratio) : 0
          return (
            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`relative flex items-end justify-center rounded-full bg-surface-sunken ${trackHeightClass} ${barWidthClass}`}
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
                aria-label={item.seconds >= 60 ? `${item.label} ${formatFocusTime(item.seconds)}` : item.label}
              >
                <div
                  className="w-full rounded-full bg-accent"
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className={`${labelClass} font-medium text-text-secondary`}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
